import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export type LoadFailureEntry = {
  /**
   * id of the aspect/env/extension that failed to load.
   */
  failedId: string;
  /**
   * the load phase where the failure happened (e.g. "load-comps-as-aspects", "require-aspects").
   */
  phase: string;
  error: string;
};

/**
 * aspect/env load errors that the loader swallowed and continued best-effort. the component is
 * loaded, but data computed by the failing aspect may be missing or stale.
 */
export class LoadFailures extends ComponentIssue {
  description = 'failed loading some aspects/envs of this component (the load continued without them)';
  solution = 'see the error details below, often resolved by running "bit install" or "bit compile"';
  data: LoadFailureEntry[] = [];
  isTagBlocker = false;
  isCacheBlocker = false;
  dataToString() {
    return this.data
      .map((entry) => `${ISSUE_FORMAT_SPACE}${entry.failedId} (during ${entry.phase}) -> ${entry.error}`)
      .join('\n');
  }
}
