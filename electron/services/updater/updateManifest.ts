import crypto from 'node:crypto';
import semver from './semverUtils';
import type { UpdateChannel } from '../../../src/shared/types/updater';

export const UPDATE_APP_ID = 'com.maswitch.desktop';
export const UPDATE_MANIFEST_SCHEMA_VERSION = 1;
export const UPDATE_MANIFEST_ASSET_NAME = 'maswitch-update-manifest.json';
export const UPDATE_SIGNATURE_ASSET_NAME = 'maswitch-update-manifest.json.sig';
export const MAX_MANIFEST_BYTES = 16 * 1024;
export const MAX_INSTALLER_BYTES = 1024 * 1024 * 1024;

const INSTALLER_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.exe$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const KEY_ID_PATTERN = /^[a-f0-9]{16}$/;

export interface UpdateTrustKey {
  keyId: string;
  publicKeyPem: string;
}

/** Signed fields. The signature covers the exact manifest file bytes. */
export interface SignedUpdateManifest {
  schemaVersion: 1;
  appId: string;
  version: string;
  channel: UpdateChannel;
  releaseTag: string;
  installer: {
    fileName: string;
    sha256: string;
    size: number;
  };
  keyId: string;
  createdAtIso: string;
}

export interface UpdateSignatureFile {
  keyId: string;
  algorithm: 'ed25519';
  signature: string;
}

export interface ManifestExpectations {
  currentVersion: string;
  requestedChannel: UpdateChannel;
  releaseTag: string;
  releaseAssetNames: readonly string[];
}

export class UpdateVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpdateVerificationError';
  }
}

/** Key ID = first 16 hex chars of SHA-256 over the SPKI DER encoding of the public key. */
export function computeKeyId(publicKey: crypto.KeyObject): string {
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
}

function fail(message: string): never {
  throw new UpdateVerificationError(message);
}

function parseSignatureFile(signatureBytes: Buffer): UpdateSignatureFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(signatureBytes.toString('utf8'));
  } catch {
    fail('Update signature file is not valid JSON.');
  }
  const sig = parsed as Partial<UpdateSignatureFile>;
  if (
    !sig ||
    sig.algorithm !== 'ed25519' ||
    typeof sig.keyId !== 'string' ||
    !KEY_ID_PATTERN.test(sig.keyId) ||
    typeof sig.signature !== 'string'
  ) {
    fail('Update signature file is malformed.');
  }
  return sig as UpdateSignatureFile;
}

function loadTrustedKey(keyId: string, trustedKeys: readonly UpdateTrustKey[]): crypto.KeyObject {
  const entry = trustedKeys.find((k) => k.keyId === keyId);
  if (!entry) {
    fail(`Update was signed with an untrusted key (${keyId}).`);
  }
  const key = crypto.createPublicKey(entry.publicKeyPem);
  if (key.asymmetricKeyType !== 'ed25519' || computeKeyId(key) !== entry.keyId) {
    fail('Embedded update trust key is invalid.');
  }
  return key;
}

function validateManifestShape(value: unknown): SignedUpdateManifest {
  const m = value as Partial<SignedUpdateManifest> | null;
  const installer = m?.installer as Partial<SignedUpdateManifest['installer']> | undefined;
  if (
    !m ||
    m.schemaVersion !== UPDATE_MANIFEST_SCHEMA_VERSION ||
    typeof m.appId !== 'string' ||
    typeof m.version !== 'string' ||
    (m.channel !== 'stable' && m.channel !== 'beta') ||
    typeof m.releaseTag !== 'string' ||
    typeof m.keyId !== 'string' ||
    typeof m.createdAtIso !== 'string' ||
    !installer ||
    typeof installer.fileName !== 'string' ||
    typeof installer.sha256 !== 'string' ||
    typeof installer.size !== 'number'
  ) {
    fail('Update manifest is missing required fields or uses an unsupported schema.');
  }
  if (!INSTALLER_FILENAME_PATTERN.test(installer.fileName)) {
    fail('Update manifest installer filename is not allowed.');
  }
  if (!SHA256_PATTERN.test(installer.sha256)) {
    fail('Update manifest installer hash is malformed.');
  }
  if (!Number.isSafeInteger(installer.size) || installer.size <= 0 || installer.size > MAX_INSTALLER_BYTES) {
    fail('Update manifest installer size is invalid.');
  }
  if (semver.valid(m.version) !== m.version) {
    fail('Update manifest version is not a valid semantic version.');
  }
  return m as SignedUpdateManifest;
}

/**
 * Authenticates a release manifest. The Ed25519 signature is checked over the exact
 * downloaded bytes before any field is trusted; every field is then bound to the
 * release being offered and to the running application.
 */
export function verifySignedUpdateManifest(
  manifestBytes: Buffer,
  signatureBytes: Buffer,
  trustedKeys: readonly UpdateTrustKey[],
  expected: ManifestExpectations
): SignedUpdateManifest {
  if (trustedKeys.length === 0) {
    fail('This build has no update signing key configured.');
  }
  if (manifestBytes.length === 0 || manifestBytes.length > MAX_MANIFEST_BYTES) {
    fail('Update manifest size is invalid.');
  }

  const sig = parseSignatureFile(signatureBytes);
  const publicKey = loadTrustedKey(sig.keyId, trustedKeys);
  const signature = Buffer.from(sig.signature, 'base64');
  if (signature.length !== 64 || !crypto.verify(null, manifestBytes, publicKey, signature)) {
    fail('Update manifest signature is invalid.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    fail('Update manifest is not valid JSON.');
  }
  const manifest = validateManifestShape(parsed);

  if (manifest.keyId !== sig.keyId) {
    fail('Update manifest key ID does not match its signature.');
  }
  if (manifest.appId !== UPDATE_APP_ID) {
    fail('Update manifest belongs to a different application.');
  }
  if (manifest.releaseTag !== expected.releaseTag) {
    fail('Update manifest does not belong to this release.');
  }
  const tagVersion = semver.clean(expected.releaseTag.replace(/^v/i, ''));
  if (tagVersion !== manifest.version) {
    fail('Update manifest version does not match the release tag.');
  }
  if (expected.requestedChannel === 'stable' && (manifest.channel !== 'stable' || manifest.version.includes('-'))) {
    fail('Update manifest is not a stable-channel release.');
  }
  if (!semver.gt(manifest.version, expected.currentVersion)) {
    fail('Update manifest does not describe a newer version (downgrade rejected).');
  }
  if (!expected.releaseAssetNames.includes(manifest.installer.fileName)) {
    fail('Update manifest installer does not match the release asset.');
  }

  return manifest;
}
