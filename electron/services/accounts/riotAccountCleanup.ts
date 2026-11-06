export interface CredentialArtifactStore {
  hasCredentials(profileId: string): Promise<boolean>;
  deleteCredentials(profileId: string): Promise<boolean>;
}

export interface SessionArtifactStore {
  hasSession(accountId: string): Promise<boolean>;
  deleteSession(accountId: string): Promise<void>;
}

export type ArtifactRemovalState = 'removed' | 'absent' | 'failed' | 'skipped';

export interface RiotAccountArtifactCleanupResult {
  credentials: ArtifactRemovalState;
  session: ArtifactRemovalState;
}

const PROFILE_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;

async function removeArtifact(
  exists: () => Promise<boolean>,
  remove: () => Promise<unknown>
): Promise<ArtifactRemovalState> {
  try {
    if (!(await exists())) return 'absent';
    await remove();
    return (await exists()) ? 'failed' : 'removed';
  } catch {
    return 'failed';
  }
}

/**
 * Removes the DPAPI credential record and enrolled session belonging to exactly one
 * profile. Each store resolves its own file path from the validated ID, so nothing
 * outside the two vault directories can be touched.
 */
export async function removeRiotAccountArtifacts(
  profileId: string,
  stores: { credentials?: CredentialArtifactStore; sessions?: SessionArtifactStore }
): Promise<RiotAccountArtifactCleanupResult> {
  if (!PROFILE_ID_PATTERN.test(profileId) || profileId.includes('..')) {
    return { credentials: 'skipped', session: 'skipped' };
  }

  const { credentials, sessions } = stores;
  return {
    credentials: credentials
      ? await removeArtifact(
          () => credentials.hasCredentials(profileId),
          () => credentials.deleteCredentials(profileId)
        )
      : 'skipped',
    session: sessions
      ? await removeArtifact(
          () => sessions.hasSession(profileId),
          () => sessions.deleteSession(profileId)
        )
      : 'skipped',
  };
}
