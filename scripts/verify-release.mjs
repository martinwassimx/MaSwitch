import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

console.log('====================================================');
console.log('   MaSwitch Release Security & Signature Verifier    ');
console.log('====================================================\n');

// 1. Target files to verify
const targetFiles = [
  {
    name: 'MaSwitch-Setup-0.2.0.exe (NSIS Installer)',
    path: path.join(releaseDir, 'MaSwitch-Setup-0.2.0.exe'),
    relPath: 'MaSwitch-Setup-0.2.0.exe',
  },
  {
    name: 'MaSwitch.exe (Packaged Standalone Executable)',
    path: path.join(releaseDir, 'win-unpacked', 'MaSwitch.exe'),
    relPath: 'win-unpacked/MaSwitch.exe',
  },
];

const results = [];
const checksumLines = [];

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
    const escapedPath = target.path.replace(/'/g, "''");
    const psCmd = `
      $sig = Get-AuthenticodeSignature -LiteralPath '${escapedPath}'
      [PSCustomObject]@{
        Status = [string]$sig.Status
        StatusMessage = [string]$sig.StatusMessage
        Signer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
        TimeStamper = if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate.Subject } else { $null }
      } | ConvertTo-Json -Compress
    `;
    const psOut = execSync('powershell.exe -NoProfile -NonInteractive -Command -', {
      input: psCmd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
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

const isSigned = results.every((r) => r.signature && r.signature.status === 'Valid');
if (isSigned) {
  console.log('[✓] Artifacts are digitally signed with a verified Authenticode certificate.');
} else {
  console.log('[i] Artifacts are currently UNSIGNED (no trusted private signing key in environment).');
  console.log('    • Windows SmartScreen may display: "Windows protected your PC - Unknown Publisher".');
  console.log('    • Browser download reputation may warn: "Not commonly downloaded".');
  console.log('    • To sign in production/CI, provide CSC_LINK (PFX path/base64) & CSC_KEY_PASSWORD.');
}

console.log('====================================================\n');
