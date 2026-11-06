#!/usr/bin/env node
// MaSwitch update-manifest signing tool (Ed25519, Node.js crypto only).
//
//   node scripts/update-signing.mjs keygen --out <dir outside the repository>
//   node scripts/update-signing.mjs sign   --key <private key path> [--channel stable|beta] [--release-dir release]
//   node scripts/update-signing.mjs verify [--release-dir release]
//
// The private key passphrase is read from MASWITCH_UPDATE_KEY_PASSPHRASE (min 16 chars).
// Private key material is never printed or written inside the repository.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_ID = 'com.maswitch.desktop';
const MANIFEST_NAME = 'maswitch-update-manifest.json';
const SIGNATURE_NAME = 'maswitch-update-manifest.json.sig';
const TRUST_ROOT_PATH = path.join(rootDir, 'electron', 'services', 'updater', 'updateTrustRoot.ts');

function die(message) {
  console.error(`[x] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      args[token.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return args;
}

function isInsideRepository(target) {
  const rel = path.relative(rootDir, path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function passphrase() {
  const value = process.env.MASWITCH_UPDATE_KEY_PASSPHRASE;
  if (!value || value.length < 16) {
    die('Set MASWITCH_UPDATE_KEY_PASSPHRASE (at least 16 characters) in this shell session.');
  }
  return value;
}

function keyIdOf(publicKey) {
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
}

function loadTrustedKeys() {
  const source = fs.readFileSync(TRUST_ROOT_PATH, 'utf8');
  const keys = [];
  const pattern = /keyId:\s*'([a-f0-9]{16})'\s*,\s*publicKeyPem:\s*`([^`]+)`/g;
  for (const match of source.matchAll(pattern)) {
    keys.push({ keyId: match[1], publicKeyPem: match[2] });
  }
  return keys;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function keygen(args) {
  const outDir = typeof args.out === 'string' ? path.resolve(args.out) : null;
  if (!outDir) die('--out <directory> is required.');
  if (isInsideRepository(outDir)) die('Refusing to write signing keys inside the repository.');
  const pass = passphrase();

  fs.mkdirSync(outDir, { recursive: true });
  const privatePath = path.join(outDir, 'maswitch-update-signing.key');
  const publicPath = path.join(outDir, 'maswitch-update-signing.pub.pem');
  if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) {
    die(`A key already exists in ${outDir}. Refusing to overwrite it.`);
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: pass });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  fs.writeFileSync(privatePath, privatePem, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(publicPath, publicPem, { flag: 'wx' });

  const keyId = keyIdOf(publicKey);
  console.log(`[✓] Encrypted private key written to: ${privatePath}`);
  console.log(`[✓] Public key written to:            ${publicPath}`);
  console.log(`    Key ID: ${keyId}`);
  console.log('\nBack up the private key file and passphrase offline (two separate locations) BEFORE');
  console.log('trusting this key. Then add the following entry to UPDATE_TRUSTED_KEYS in');
  console.log('electron/services/updater/updateTrustRoot.ts:\n');
  console.log(`  {\n    keyId: '${keyId}',\n    publicKeyPem: \`${publicPem.trim()}\n\`,\n  },\n`);
}

function sign(args) {
  const keyPath = typeof args.key === 'string' ? path.resolve(args.key) : null;
  if (!keyPath) die('--key <private key path> is required.');
  if (isInsideRepository(keyPath)) die('Refusing to use a signing key stored inside the repository.');
  const channel = args.channel ?? 'stable';
  if (channel !== 'stable' && channel !== 'beta') die('--channel must be stable or beta.');

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const version = pkg.version;
  if (channel === 'stable' && version.includes('-')) die('Pre-release versions must use --channel beta.');
  const releaseDir = path.resolve(rootDir, typeof args['release-dir'] === 'string' ? args['release-dir'] : 'release');
  const fileName = `MaSwitch-Setup-${version}.exe`;
  const installerPath = path.join(releaseDir, fileName);
  if (!fs.existsSync(installerPath)) die(`Installer not found: ${installerPath}`);

  let privateKey;
  try {
    privateKey = crypto.createPrivateKey({ key: fs.readFileSync(keyPath), format: 'pem', passphrase: passphrase() });
  } catch {
    die('Unable to decrypt the signing key (wrong passphrase or corrupt key file).');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519') die('Signing key is not an Ed25519 key.');
  const keyId = keyIdOf(crypto.createPublicKey(privateKey));

  const trusted = loadTrustedKeys();
  if (!trusted.some((k) => k.keyId === keyId)) {
    die(`Key ${keyId} is not listed in updateTrustRoot.ts; installed clients would reject this manifest.`);
  }

  const manifest = {
    schemaVersion: 1,
    appId: APP_ID,
    version,
    channel,
    releaseTag: `v${version}`,
    installer: {
      fileName,
      sha256: sha256File(installerPath),
      size: fs.statSync(installerPath).size,
    },
    keyId,
    createdAtIso: new Date().toISOString(),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const signature = crypto.sign(null, manifestBytes, privateKey).toString('base64');

  fs.writeFileSync(path.join(releaseDir, MANIFEST_NAME), manifestBytes);
  fs.writeFileSync(
    path.join(releaseDir, SIGNATURE_NAME),
    `${JSON.stringify({ keyId, algorithm: 'ed25519', signature })}\n`,
    'utf8'
  );
  console.log(`[✓] Signed ${fileName} (${manifest.installer.size} bytes, sha256 ${manifest.installer.sha256})`);
  console.log(`    Upload ${fileName}, ${MANIFEST_NAME} and ${SIGNATURE_NAME} to the v${version} release.`);
}

export function verifyReleaseManifest(releaseDir, { quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  const manifestPath = path.join(releaseDir, MANIFEST_NAME);
  const signaturePath = path.join(releaseDir, SIGNATURE_NAME);
  if (!fs.existsSync(manifestPath) || !fs.existsSync(signaturePath)) {
    return { ok: false, reason: 'Signed update manifest not found (run: node scripts/update-signing.mjs sign ...).' };
  }
  const trusted = loadTrustedKeys();
  if (trusted.length === 0) {
    return { ok: false, reason: 'updateTrustRoot.ts has no trusted keys; automatic updates are disabled in this build.' };
  }
  const manifestBytes = fs.readFileSync(manifestPath);
  let sig;
  let manifest;
  try {
    sig = JSON.parse(fs.readFileSync(signaturePath, 'utf8'));
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    return { ok: false, reason: 'Manifest or signature is not valid JSON.' };
  }
  const key = trusted.find((k) => k.keyId === sig.keyId);
  if (!key) return { ok: false, reason: `Signature key ${sig.keyId} is not trusted by this build.` };
  const valid = crypto.verify(null, manifestBytes, crypto.createPublicKey(key.publicKeyPem), Buffer.from(sig.signature, 'base64'));
  if (!valid) return { ok: false, reason: 'Manifest signature is invalid.' };

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  if (manifest.appId !== APP_ID || manifest.version !== pkg.version || manifest.releaseTag !== `v${pkg.version}`) {
    return { ok: false, reason: 'Manifest app ID or version does not match package.json.' };
  }
  const installerPath = path.join(releaseDir, manifest.installer.fileName);
  if (!fs.existsSync(installerPath)) return { ok: false, reason: `Installer ${manifest.installer.fileName} missing.` };
  if (fs.statSync(installerPath).size !== manifest.installer.size || sha256File(installerPath) !== manifest.installer.sha256) {
    return { ok: false, reason: 'Installer does not match the signed manifest (rebuilt after signing?).' };
  }
  log(`[✓] Update manifest signature valid (key ${sig.keyId}); installer hash and size match.`);
  return { ok: true };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === 'keygen') keygen(args);
  else if (command === 'sign') sign(args);
  else if (command === 'verify') {
    const result = verifyReleaseManifest(
      path.resolve(rootDir, typeof args['release-dir'] === 'string' ? args['release-dir'] : 'release')
    );
    if (!result.ok) die(result.reason);
  } else {
    die('Usage: update-signing.mjs <keygen|sign|verify> [options]');
  }
}
