import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import asar from '@electron/asar';
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses';
import { verifyReleaseManifest } from './update-signing.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDirArgIndex = process.argv.indexOf('--release-dir');
const releaseDir =
  releaseDirArgIndex > 0 && process.argv[releaseDirArgIndex + 1]
    ? path.resolve(process.argv[releaseDirArgIndex + 1])
    : path.join(rootDir, 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
const appVersion = pkg.version || '1.0.0';
const installerFileName = `MaSwitch-Setup-${appVersion}.exe`;

console.log('====================================================');
console.log('   MaSwitch Release Security & Signature Verifier    ');
console.log('====================================================\n');

// 1. Target files to verify
const targetFiles = [
  {
    name: `${installerFileName} (NSIS Installer)`,
    path: path.join(releaseDir, installerFileName),
    relPath: installerFileName,
  },
  {
    name: 'MaSwitch.exe (Packaged Standalone Executable)',
    path: path.join(releaseDir, 'win-unpacked', 'MaSwitch.exe'),
    relPath: 'win-unpacked/MaSwitch.exe',
  },
];

const results = [];
const checksumLines = [];
const failures = [];
const strict = process.argv.includes('--strict');

for (const target of targetFiles) {
  console.log(`Checking: ${target.name}...`);
  if (!fs.existsSync(target.path)) {
    console.warn(`  [!] File not found: ${target.path}`);
    results.push({
      target: target.name,
      exists: false,
    });
    continue;
  }

  const fileStat = fs.statSync(target.path);
  const fileBytes = fs.readFileSync(target.path);

  // Calculate SHA-256
  const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
  const sizeMb = (fileStat.size / (1024 * 1024)).toFixed(2);
  checksumLines.push(`${sha256}  ${target.relPath}`);

  // Query Windows Authenticode signature via PowerShell
  let signatureInfo = {
    status: 'Unknown',
    statusMessage: '',
    signerSubject: null,
    timeStamperSubject: null,
  };

  try {
    const psCmd = `
      $sig = Get-AuthenticodeSignature -LiteralPath $env:MASWITCH_VERIFY_PATH
      [PSCustomObject]@{
        Status = [string]$sig.Status
        StatusMessage = [string]$sig.StatusMessage
        Signer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
        TimeStamper = if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate.Subject } else { $null }
      } | ConvertTo-Json -Compress
    `;
    const psOut = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
      encoding: 'utf-8',
      env: { ...process.env, MASWITCH_VERIFY_PATH: target.path },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();

    if (psOut) {
      const parsed = JSON.parse(psOut);
      signatureInfo = {
        status: parsed.Status || 'Unknown',
        statusMessage: parsed.StatusMessage || '',
        signerSubject: parsed.Signer || null,
        timeStamperSubject: parsed.TimeStamper || null,
      };
    }
  } catch (err) {
    signatureInfo.status = 'QueryError';
    signatureInfo.statusMessage = String(err.stderr || err.message || err);
  }

  results.push({
    target: target.name,
    path: target.path,
    sizeBytes: fileStat.size,
    sizeMb: `${sizeMb} MB`,
    sha256,
    signature: signatureInfo,
  });

  console.log(`  Size: ${sizeMb} MB (${fileStat.size.toLocaleString()} bytes)`);
  console.log(`  SHA-256: ${sha256}`);
  console.log(`  Authenticode Status: ${signatureInfo.status}`);
  if (signatureInfo.signerSubject) {
    console.log(`  Signer: ${signatureInfo.signerSubject}`);
  }
  if (signatureInfo.timeStamperSubject) {
    console.log(`  Timestamp: ${signatureInfo.timeStamperSubject}`);
  }
  console.log('');
}

// 2. Write SHA256SUMS.txt
const checksumFilePath = path.join(releaseDir, 'SHA256SUMS.txt');
if (checksumLines.length > 0) {
  fs.writeFileSync(checksumFilePath, checksumLines.join('\n') + '\n', 'utf-8');
  console.log(`[✓] Generated checksums file: ${checksumFilePath}\n`);
}

// 3. Security posture summary
console.log('----------------------------------------------------');
console.log('             Security & Signing Summary             ');
console.log('----------------------------------------------------');

const updateManifest = verifyReleaseManifest(releaseDir, { quiet: true });
if (updateManifest.ok) {
  console.log('[✓] Signed update manifest verified against the embedded update trust root.');
} else {
  console.log(`[!] Update manifest: ${updateManifest.reason}`);
  console.log('    Installed clients will NOT auto-install this release; users must download it manually.');
  failures.push(`update manifest: ${updateManifest.reason}`);
}
console.log('[i] SHA256SUMS.txt is a convenience for manual downloads; it is not independent proof of authenticity.');

const isSigned = results.every((r) => r.signature && r.signature.status === 'Valid');
if (isSigned) {
  console.log('[✓] Artifacts are digitally signed with a verified Authenticode certificate.');
} else {
  console.log('[i] Artifacts are currently UNSIGNED (no trusted private signing key in environment).');
  console.log('    • Windows SmartScreen may display: "Windows protected your PC - Unknown Publisher".');
  console.log('    • Browser download reputation may warn: "Not commonly downloaded".');
  console.log('    • To sign in production/CI, provide CSC_LINK (PFX path/base64) & CSC_KEY_PASSWORD.');
}

for (const r of results) {
  if (r.exists === false) failures.push(`missing artifact: ${r.target}`);
}

// 4. Dependency lockfile consistency
const lockPath = path.join(rootDir, 'package-lock.json');
if (!fs.existsSync(lockPath)) {
  failures.push('package-lock.json is missing');
} else {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
  const lockRoot = (lock.packages && lock.packages['']) || {};
  if (lock.lockfileVersion < 3) failures.push(`lockfileVersion ${lock.lockfileVersion} is older than 3`);
  if (lockRoot.version !== pkg.version) failures.push('package-lock.json version does not match package.json');
  for (const field of ['dependencies', 'devDependencies']) {
    const declared = pkg[field] || {};
    const locked = lockRoot[field] || {};
    for (const [name, range] of Object.entries(declared)) {
      if (locked[name] !== range) failures.push(`lockfile ${field} out of sync for ${name}`);
    }
    for (const name of Object.keys(locked)) {
      if (!(name in declared)) failures.push(`lockfile ${field} has undeclared ${name}`);
    }
  }
  if (!/^\d+\.\d+\.\d+$/.test(pkg.devDependencies?.electron || '')) {
    failures.push('electron must be pinned to an exact version');
  }
  const insecureResolved = Object.entries(lock.packages || {}).filter(
    ([, meta]) => meta && typeof meta.resolved === 'string' && !meta.resolved.startsWith('https://registry.npmjs.org/')
  );
  for (const [name] of insecureResolved) failures.push(`lockfile entry not resolved from the npm registry over HTTPS: ${name}`);
  const missingIntegrity = Object.entries(lock.packages || {}).filter(
    ([key, meta]) => key && meta && meta.resolved && !meta.integrity
  );
  for (const [name] of missingIntegrity) failures.push(`lockfile entry without integrity hash: ${name}`);
  console.log('[i] Lockfile consistency checked.');
}

// 5. Packaged application contents and Electron fuses
const unpackedDir = path.join(releaseDir, 'win-unpacked');
const asarPath = path.join(unpackedDir, 'resources', 'app.asar');
const exePath = path.join(unpackedDir, 'MaSwitch.exe');
const FORBIDDEN_ASAR_ENTRIES = [
  { pattern: /\.(pem|key|pfx|p12|snk|env)$/i, reason: 'key or environment file' },
  { pattern: /(^|[\\/])\.env(\.|$)/i, reason: 'environment file' },
  { pattern: /security-audit/i, reason: 'private security audit material' },
  { pattern: /update-signing/i, reason: 'release signing tooling' },
  { pattern: /\.map$/i, reason: 'source map' },
  { pattern: /^[\\/](src|tests|scripts|docs)[\\/]/i, reason: 'source or tooling directory' },
  { pattern: /(^|[\\/])\.git([\\/]|$)/i, reason: 'git metadata' },
];
if (!fs.existsSync(asarPath)) {
  failures.push(`app.asar not found at ${asarPath}`);
} else {
  const entries = asar.listPackage(asarPath);
  for (const entry of entries) {
    const hit = FORBIDDEN_ASAR_ENTRIES.find((rule) => rule.pattern.test(entry));
    if (hit) failures.push(`unexpected file in app.asar (${hit.reason}): ${entry}`);
  }
  const asarBytes = fs.readFileSync(asarPath);
  for (const marker of ['BEGIN PRIVATE KEY', 'BEGIN ENCRYPTED PRIVATE KEY', 'BEGIN RSA PRIVATE KEY', 'MASWITCH_UPDATE_KEY_PASSPHRASE=']) {
    if (asarBytes.includes(Buffer.from(marker))) failures.push(`app.asar contains private key material marker: ${marker}`);
  }
  if (fs.existsSync(path.join(unpackedDir, 'resources', 'app'))) {
    failures.push('an unpacked resources/app folder exists next to app.asar');
  }
  console.log(`[i] Inspected ${entries.length} app.asar entries.`);
}
if (fs.existsSync(exePath)) {
  const wire = await getCurrentFuseWire(exePath);
  const expected = {
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  };
  for (const [option, want] of Object.entries(expected)) {
    const raw = wire[option];
    const enabled = raw === 49 || raw === '1' || raw === 1 || raw === true;
    if (enabled !== want) failures.push(`Electron fuse ${FuseV1Options[option]} is ${enabled ? 'enabled' : 'disabled'}`);
  }
  console.log('[i] Electron fuses checked.');
}

console.log('====================================================\n');

if (failures.length > 0) {
  console.log(`Release check found ${failures.length} problem(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  if (strict) process.exit(1);
} else {
  console.log('Release check passed.');
}
