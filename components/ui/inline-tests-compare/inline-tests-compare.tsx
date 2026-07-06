import React, { useMemo } from 'react';
import { useComponentCompare, InlineCompareEmpty } from '@teambit/component.ui.component-compare.context';
import { useDiffMode } from '@teambit/component.ui.component-compare.component-compare';
import { DiffFileRenderer, DiffLoadingSkeleton, buildFileDiffsFromMap } from '@teambit/code.ui.inline-diff-viewer';

export function InlineTestsCompare() {
  const diffMode = useDiffMode();
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
