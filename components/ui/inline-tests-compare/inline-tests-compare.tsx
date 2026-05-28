import React, { useMemo } from 'react';
import { useComponentCompare, InlineCompareEmpty } from '@teambit/component.ui.component-compare.context';
import { useDiffMode } from '@teambit/component.ui.component-compare.component-compare';
import {
  DiffFileRenderer,
  computeDiffFromContent,
  type DiffHunk,
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

  const testDiffs = useMemo(() => {
    if (!testCompareDataByName) return [];

    const diffs: Array<{ fileName: string; hunks: DiffHunk[]; status: string; additions: number; deletions: number }> =
      [];

    for (const [fileName, fileData] of testCompareDataByName.entries()) {
      if (fileData.status === 'UNCHANGED') continue;

      const baseContent = fileData.baseContent || '';
      const compareContent = fileData.compareContent || '';

      let hunks: DiffHunk[];

      if (fileData.status === 'NEW') {
        const lines = compareContent.split('\n');
        hunks = [
          {
            header: `@@ -0,0 +1,${lines.length} @@`,
            lines: lines.map((line: string, i: number) => ({
              type: 'added' as const,
              content: line,
              newLineNumber: i + 1,
            })),
          },
        ];
      } else if (fileData.status === 'DELETED') {
        const lines = baseContent.split('\n');
        hunks = [
          {
            header: `@@ -1,${lines.length} +0,0 @@`,
            lines: lines.map((line: string, i: number) => ({
              type: 'removed' as const,
              content: line,
              oldLineNumber: i + 1,
            })),
          },
        ];
      } else {
        hunks = computeDiffFromContent(baseContent, compareContent);
      }

      const additions = hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.type === 'added').length, 0);
      const deletions = hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.type === 'removed').length, 0);

      if (additions > 0 || deletions > 0) {
        diffs.push({ fileName, hunks, status: fileData.status, additions, deletions });
      }
    }

    return diffs;
  }, [testCompareDataByName]);

  if (!componentCompare || componentCompare.loading || testCompareDataByName === undefined) {
    return (
      <div style={{ padding: 16, color: 'var(--on-background-medium-color, #a0aec0)', fontSize: 12 }}>Loading...</div>
    );
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
