import type { UpdateTrustKey } from './updateManifest';

/**
 * Ed25519 public keys trusted to sign MaSwitch update manifests.
 *
 * Empty means automatic update installation is disabled: updates are still detected,
 * but users are directed to the release page. Add the production key only after it has
 * been generated offline and backed up (see `scripts/update-signing.mjs keygen`).
 * Keep superseded keys listed during a rotation so older releases remain installable.
 *
 * Entries must keep the `keyId: '<hex>', publicKeyPem: \`<PEM>\`` layout printed by the
 * keygen command; `scripts/update-signing.mjs` parses this file to verify releases.
 */
export const UPDATE_TRUSTED_KEYS: readonly UpdateTrustKey[] = [];
