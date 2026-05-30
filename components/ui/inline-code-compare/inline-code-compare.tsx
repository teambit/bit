import React, { useMemo } from 'react';
import { useComponentCompare, InlineCompareEmpty } from '@teambit/component.ui.component-compare.context';
import { useDiffMode } from '@teambit/component.ui.component-compare.component-compare';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import {
  DiffFileRenderer,
  DiffFileHeader,
  computeDiffFromContent,
  type DiffHunk,
  type DiffDisplayMode,
} from '@teambit/code.ui.inline-diff-viewer';

export type InlineCodeCompareProps = {
  /** Split or unified diff mode */
  diffMode?: DiffDisplayMode;
};

export function InlineCodeCompare({ diffMode: diffModeProp }: InlineCodeCompareProps) {
  const contextDiffMode = useDiffMode();
  const diffMode = diffModeProp || contextDiffMode;
  const componentCompare = useComponentCompare();

  const fileCompareDataByName = (componentCompare as any)?.fileCompareDataByName as Map<string, any> | undefined | null;
  const compareModel = componentCompare?.compare?.model;
  const baseModel = componentCompare?.base?.model;
  const componentIdStr = (compareModel?.id || baseModel?.id)?.toStringWithoutVersion?.() || '';
  const _isNew = !baseModel && !!compareModel;

  const { fileDiffs, newFiles } = useMemo(() => {
    if (!fileCompareDataByName) return { fileDiffs: [], newFiles: [] };

    const diffs: Array<{ fileName: string; hunks: DiffHunk[]; status: string; additions: number; deletions: number }> =
      [];
    const pending: string[] = [];

    for (const [fileName, fileData] of fileCompareDataByName.entries()) {
      if (fileData.status === 'UNCHANGED') continue;

      if (fileData.status === 'NEW' && fileData.compareContent === undefined) {
        pending.push(fileName);
        continue;
      }

      const baseContent = fileData.baseContent || '';
      const compareContent = fileData.compareContent || '';

      let hunks: DiffHunk[];

      if (fileData.status === 'NEW') {
        hunks = computeNewFileHunks(compareContent);
      } else if (fileData.status === 'DELETED') {
        hunks = computeDeletedFileHunks(baseContent);
      } else {
        hunks = computeDiffFromContent(baseContent, compareContent);
      }

      const additions = hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.type === 'added').length, 0);
      const deletions = hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.type === 'removed').length, 0);

      if (additions > 0 || deletions > 0) {
        diffs.push({ fileName, hunks, status: fileData.status, additions, deletions });
      }
    }

    return { fileDiffs: diffs, newFiles: pending };
  }, [fileCompareDataByName]);

  if (!componentCompare || componentCompare.loading || fileCompareDataByName === undefined) {
    return (
      <div style={{ borderBottom: '1px solid var(--border-medium-color, #e8ecf0)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            background: 'var(--surface-neutral-color, #f8f9fb)',
            borderBottom: '1px solid var(--border-medium-color, #e8ecf0)',
          }}
        >
          <div
            style={{ width: '30%', height: 14, borderRadius: 4, background: 'var(--surface-neutral-color, #f0f2f5)' }}
          />
          <div
            style={{ width: 60, height: 14, borderRadius: 4, background: 'var(--surface-neutral-color, #f0f2f5)' }}
          />
        </div>
        <div style={{ padding: '4px 0' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 12px', alignItems: 'center' }}>
              <div
                style={{ width: 30, height: 12, borderRadius: 4, background: 'var(--surface-neutral-color, #f0f2f5)' }}
              />
              <div
                style={{ width: 30, height: 12, borderRadius: 4, background: 'var(--surface-neutral-color, #f0f2f5)' }}
              />
              <div
                style={{
                  width: `${40 + (i % 3) * 20}%`,
                  height: 12,
                  borderRadius: 4,
                  background: 'var(--surface-neutral-color, #f0f2f5)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fileDiffs.length === 0 && newFiles.length === 0) {
    return <InlineCompareEmpty message="No code changes" />;
  }

  return (
    <div>
      {fileDiffs.map((file) => (
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
      {newFiles.map((fileName) => (
        <NewFileDiff
          key={fileName}
          fileName={fileName}
          componentId={compareModel?.id}
          diffMode={diffMode}
          dataFileId={componentIdStr ? `${componentIdStr}:${fileName}` : undefined}
        />
      ))}
    </div>
  );
}

function NewFileDiff({
  fileName,
  componentId,
  diffMode,
  dataFileId,
}: {
  fileName: string;
  componentId: any;
  diffMode?: DiffDisplayMode;
  dataFileId?: string;
}) {
  const { fileContent, loading } = useFileContent(componentId, fileName);

  const { hunks, additions } = useMemo(() => {
    if (!fileContent) return { hunks: [], additions: 0 };
    const h = computeNewFileHunks(fileContent);
    return { hunks: h, additions: h[0]?.lines.length || 0 };
  }, [fileContent]);

  if (loading) {
    return (
      <div data-file-id={dataFileId}>
        <DiffFileHeader fileName={fileName} status="NEW" />
        <div style={{ padding: '4px 0' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 12px', alignItems: 'center' }}>
              <div
                style={{ width: 30, height: 12, borderRadius: 4, background: 'var(--surface-neutral-color, #f0f2f5)' }}
              />
              <div
                style={{ width: 30, height: 12, borderRadius: 4, background: 'var(--surface-neutral-color, #f0f2f5)' }}
              />
              <div
                style={{
                  width: `${40 + (i % 3) * 20}%`,
                  height: 12,
                  borderRadius: 4,
                  background: 'var(--surface-neutral-color, #f0f2f5)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!fileContent) return null;

  return (
    <DiffFileRenderer
      fileName={fileName}
      hunks={hunks}
      status="NEW"
      diffMode={diffMode}
      additions={additions}
      deletions={0}
      dataFileId={dataFileId}
    />
  );
}

function computeNewFileHunks(content: string): DiffHunk[] {
  const lines = content.split('\n');
  return [
    {
      header: `@@ -0,0 +1,${lines.length} @@`,
      lines: lines.map((line, i) => ({ type: 'added' as const, content: line, newLineNumber: i + 1 })),
    },
  ];
}

function computeDeletedFileHunks(content: string): DiffHunk[] {
  const lines = content.split('\n');
  return [
    {
      header: `@@ -1,${lines.length} +0,0 @@`,
      lines: lines.map((line, i) => ({ type: 'removed' as const, content: line, oldLineNumber: i + 1 })),
    },
  ];
}
