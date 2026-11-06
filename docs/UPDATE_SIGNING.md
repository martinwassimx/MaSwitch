# Update signing (maintainers)

MaSwitch installs updates only when the release carries a manifest signed with an
Ed25519 key listed in `electron/services/updater/updateTrustRoot.ts`. Releases without
a valid signature are still announced in the app, but users are sent to the release
page instead of being offered automatic installation.

This is independent of Windows Authenticode signing, which is not configured.

## One-time setup: create the production key

Run on a trusted machine. The key must never be stored inside the repository, in CI
logs, or in any cloud-synced folder you do not control.

Set the passphrase (at least 16 characters) for the current shell only:

```powershell
$s = Read-Host 'Signing key passphrase' -AsSecureString
$env:MASWITCH_UPDATE_KEY_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
```

```powershell
node scripts/update-signing.mjs keygen --out D:\MaSwitchKeys
Remove-Item Env:MASWITCH_UPDATE_KEY_PASSPHRASE
```

1. Back up `maswitch-update-signing.key` (encrypted) and the passphrase in two separate
   offline locations (for example an encrypted USB drive and a password manager).
   Losing either means existing installs can no longer auto-update.
2. Paste the printed `{ keyId, publicKeyPem }` entry into `UPDATE_TRUSTED_KEYS`.
3. Commit only that public-key change.

## Every release

```powershell
npm run build
npx electron-builder --win
# set MASWITCH_UPDATE_KEY_PASSPHRASE as shown above
node scripts/update-signing.mjs sign --key D:\MaSwitchKeys\maswitch-update-signing.key --channel stable
Remove-Item Env:MASWITCH_UPDATE_KEY_PASSPHRASE
npm run verify:release -- --strict
```

Upload `MaSwitch-Setup-<version>.exe`, `maswitch-update-manifest.json` and
`maswitch-update-manifest.json.sig` to the `v<version>` release. Do not rebuild the
installer after signing; the manifest pins its exact SHA-256 and size.

Use `--channel beta` for pre-release versions.

## Upgrading from older versions

Versions up to and including 1.0.4 do not understand signed manifests. Users of those
versions must install the first signed release by downloading it manually from the
official GitHub release page. Every later update is verified automatically.

## Key rotation and compromise

- Rotation: add the new key to `UPDATE_TRUSTED_KEYS`, ship a release signed with the
  old key, then sign subsequent releases with the new key. Remove the old key after
  most users have updated.
- Compromise: remove the key from `UPDATE_TRUSTED_KEYS`, publish a release signed with a
  remaining trusted key (or, if none remain, a manually installed release), and announce it.
