import React from 'react';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import {
  ComponentApiDiffSection,
  ApiDiffSlimRow,
  ApiDiffInsightProvider,
  useApiDiff,
} from '@teambit/semantics.ui.api-diff-view';
import type { ApiDiffInsight } from '@teambit/semantics.ui.api-diff-view';
import styles from './api-compare.module.scss';

// single source of truth for the API diff model lives in api-diff-view.
export type { APIDiffResult, APIDiffChange, APIDiffDetail } from '@teambit/semantics.ui.api-diff-view';

export type APICompareProps = {
  /** resolved lazily at render time — slot registrations can land after the section is constructed */
  getInsights?: () => ApiDiffInsight[];
};

/**
 * the API tab of the single-component compare page. thin host around the same
 * `ComponentApiDiffSection` the lane-compare API view uses — one implementation, two hosts.
 * data comes from the compare context (fetched once by ComponentCompare).
 */
export function APICompare({ getInsights }: APICompareProps) {
  const compareContext = useComponentCompare();
  const baseModel = compareContext?.base?.model;
  const compareModel = compareContext?.compare?.model;

  // Prefer a diff already on the context — the legacy `ComponentCompare` fetches it once and sets
  // it there. The redesign single-component page does NOT put it on its inline context, so we fetch
  // on our own. This hook is only mounted when the API view is the active tab (the page renders the
  // element on-demand), so lane-compare — which renders one panel per component and never mounts
  // this tab — pays nothing.
  const contextApiDiff = compareContext?.apiDiffResult;
  const shouldSelfFetch = contextApiDiff === undefined;
  const { result: fetchedApiDiff } = useApiDiff(baseModel?.id.toString(), compareModel?.id.toString(), {
    skip: !shouldSelfFetch,
  });
  const apiDiffResult = shouldSelfFetch ? fetchedApiDiff : contextApiDiff;

  // memoized so the insights context value keeps a stable identity — otherwise a fresh array every
  // render would re-render every `useApiDiffInsights` consumer (incl. the React.memo'd ApiChangeBlock).
  const insights = React.useMemo(() => getInsights?.(), [getInsights]);

  if (!compareContext) return null;

  const id = (compareModel || baseModel)?.id;
  if (!id) return null;

  const componentIdStr = id.toStringWithoutVersion();
  const baseVersion = baseModel?.id.version;
  const compareVersion = compareModel?.id.version;

  // no base (first version) or identical versions — nothing to diff, not a failure.
  const nothingToCompare = apiDiffResult === null && (!baseVersion || baseVersion === compareVersion);

  return (
    <ApiDiffInsightProvider insights={insights}>
      <div className={styles.apiCompareContainer}>
        {nothingToCompare ? (
          <ApiDiffSlimRow
            componentIdStr={componentIdStr}
            displayName={id.fullName}
            chip="nothing to compare"
            detail={baseVersion ? 'both sides are the same version' : 'no base version to compare against'}
            tone="ok"
          />
        ) : (
          <ComponentApiDiffSection
            componentIdStr={componentIdStr}
            displayName={id.fullName}
            baseId={baseModel?.id.toString()}
            compareId={compareModel?.id.toString()}
            baseVersion={baseVersion}
            compareVersion={compareVersion}
            result={apiDiffResult}
            loading={apiDiffResult === undefined}
          />
        )}
      </div>
    </ApiDiffInsightProvider>
  );
}
