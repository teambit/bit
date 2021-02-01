import { BitError } from '@teambit/bit-error';

export class PersistFailed extends BitError {
  constructor(
    failedScope: string,
    persistedScopes: string[],
    notPersistedScopes: string[],
    clientId: string,
    errorMsg: string,
    triggeredByResumeExportCmd: boolean
  ) {
    const resumeFlagSuggestion = `you can resume the export by re-running the same export command with the suffix: "--resume ${clientId}".`;
    const resumeExportSuggestion = `you can re-try running resume-export command with the non-persisted scopes.`;
    super(`fatal: export failed during the persist phase of "${failedScope}", with the error "${errorMsg}", see the log for the error details.
the following scopes were persisted successfully: ${persistedScopes.length ? persistedScopes.join(', ') : '<none>'}.
the following scopes were not persisted yet: ${notPersistedScopes.length ? notPersistedScopes.join(', ') : '<none>'}.

${triggeredByResumeExportCmd ? resumeExportSuggestion : resumeFlagSuggestion}
`);
  }
}
