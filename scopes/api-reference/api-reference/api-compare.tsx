import React from 'react';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { ComponentApiDiffSection, ApiDiffSlimRow, ApiDiffInsightProvider } from '@teambit/semantics.ui.api-diff-view';
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
  if (!compareContext) return null;

  const { apiDiffResult } = compareContext;
  const baseModel = compareContext.base?.model;
  const compareModel = compareContext.compare?.model;
  const id = (compareModel || baseModel)?.id;
  if (!id) return null;

  const componentIdStr = id.toStringWithoutVersion();
  const baseVersion = baseModel?.id.version;
  const compareVersion = compareModel?.id.version;

  // no base (first version) or identical versions — nothing to diff, not a failure.
  const nothingToCompare = apiDiffResult === null && (!baseVersion || baseVersion === compareVersion);

  return (
    <ApiDiffInsightProvider insights={getInsights?.()}>
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
