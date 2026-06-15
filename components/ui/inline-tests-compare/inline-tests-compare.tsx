import React, { useMemo } from 'react';
import { useComponentCompare, InlineCompareEmpty } from '@teambit/component.ui.component-compare.context';
import { useDiffMode } from '@teambit/component.ui.component-compare.component-compare';
import {
  DiffFileRenderer,
  DiffLoadingSkeleton,
  buildFileDiffsFromMap,
  type DiffDisplayMode,
} from '@teambit/code.ui.inline-diff-viewer';

export type InlineTestsCompareProps = {
  diffMode?: DiffDisplayMode;
};

export function InlineTestsCompare({ diffMode: diffModeProp }: InlineTestsCompareProps) {
  const contextDiffMode = useDiffMode();
  const diffMode = diffModeProp || contextDiffMode;
  const componentCompare = useComponentCompare();

  const testCompareDataByName = (componentCompare as any)?.testCompareDataByName as Map<string, any> | undefined | null;
  const componentIdStr =
    (componentCompare?.compare?.model?.id || componentCompare?.base?.model?.id)?.toStringWithoutVersion?.() || '';

  const testDiffs = useMemo(
    () => (testCompareDataByName ? buildFileDiffsFromMap(testCompareDataByName) : []),
    [testCompareDataByName]
  );

  if (!componentCompare || componentCompare.loading || testCompareDataByName === undefined) {
    return <DiffLoadingSkeleton />;
  }

  if (testDiffs.length === 0) {
    return <InlineCompareEmpty message="No test changes" />;
  }

  return (
    <div>
      {testDiffs.map((file) => (
        <DiffFileRenderer
          key={file.fileName}
          fileName={file.fileName}
          hunks={file.hunks}
          status={file.status}
          diffMode={diffMode}
          additions={file.additions}
          deletions={file.deletions}
          dataFileId={componentIdStr ? `${componentIdStr}:${file.fileName}` : undefined}
        />
      ))}
    </div>
  );
}
