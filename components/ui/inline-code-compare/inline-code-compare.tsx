import React, { useMemo } from 'react';
import { useComponentCompare, InlineCompareEmpty } from '@teambit/component.ui.component-compare.context';
import { useDiffMode } from '@teambit/component.ui.component-compare.component-compare';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import { DiffLoadingSkeleton } from '@teambit/code.ui.inline-diff-viewer';
import {
  DiffViewer,
  computeDiffLines,
  statsFromItems,
  type DiffViewMode,
  type DiffFileStatus,
} from '@teambit/code.ui.diff-viewer';

type FileCompareData = { status: string; baseContent?: string; compareContent?: string };

type ReadyFile = { fileName: string; status: DiffFileStatus; oldContent: string; newContent: string };

/** map the bulk-payload status (uppercase) onto the DiffViewer status. */
function toDiffStatus(status: string): DiffFileStatus {
  if (status === 'NEW') return 'new';
  if (status === 'DELETED') return 'deleted';
  return 'modified';
}

// `grid-template-columns: minmax(0, 1fr)` hard-constrains every file row to the pane width: a grid
// item in a `minmax(0, ...)` track cannot be widened by its (wide) content, so a long code line can
// only scroll inside the diff body — it can never push the row, pane, or page horizontally wider.
const GRID_WRAP: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' };
const CELL_WRAP: React.CSSProperties = { minWidth: 0 };

export function InlineCodeCompare() {
  const diffMode = useDiffMode();
  const view: DiffViewMode = diffMode === 'unified' ? 'unified' : 'split';
  const componentCompare = useComponentCompare();

  const fileCompareDataByName = (componentCompare as any)?.fileCompareDataByName as
    | Map<string, FileCompareData>
    | undefined
    | null;
  const compareModel = componentCompare?.compare?.model;
  const baseModel = componentCompare?.base?.model;
  const componentIdStr = (compareModel?.id || baseModel?.id)?.toStringWithoutVersion?.() || '';

  const { files, newFiles } = useMemo(() => {
    if (!fileCompareDataByName) return { files: [] as ReadyFile[], newFiles: [] as string[] };
    const ready: ReadyFile[] = [];
    const pending: string[] = [];
    for (const [fileName, fileData] of fileCompareDataByName.entries()) {
      if (fileData.status === 'UNCHANGED') continue;
      // NEW files whose content hasn't arrived in the bulk payload are fetched lazily below.
      if (fileData.status === 'NEW' && fileData.compareContent === undefined) {
        pending.push(fileName);
        continue;
      }
      const oldContent = fileData.baseContent || '';
      const newContent = fileData.compareContent || '';
      // drop no-op entries (identical content) so only real changes render — matches prior behavior.
      const stats = statsFromItems(computeDiffLines(oldContent, newContent));
      if (stats.additions === 0 && stats.deletions === 0) continue;
      ready.push({ fileName, status: toDiffStatus(fileData.status), oldContent, newContent });
    }
    return { files: ready, newFiles: pending };
  }, [fileCompareDataByName]);

  if (!componentCompare || componentCompare.loading || fileCompareDataByName === undefined) {
    return <DiffLoadingSkeleton />;
  }

  if (files.length === 0 && newFiles.length === 0) {
    return <InlineCompareEmpty message="No code changes" />;
  }

  // GRID_WRAP (minmax(0,1fr)) hard-constrains every file row to the pane width so a long code line can
  // only scroll inside the diff body — never widening the row, pane, or page. More reliable than
  // `contain: inline-size` through the `content-visibility`/context wrappers between here and the pane.
  return (
    <div style={GRID_WRAP}>
      {files.map((file) => (
        <div
          key={file.fileName}
          data-file-id={componentIdStr ? `${componentIdStr}:${file.fileName}` : undefined}
          style={CELL_WRAP}
        >
          <DiffViewer
            fileName={file.fileName}
            oldContent={file.oldContent}
            newContent={file.newContent}
            status={file.status}
            view={view}
            showViewToggle={false}
            virtualize={false}
            wrap
          />
        </div>
      ))}
      {newFiles.map((fileName) => (
        <NewFileDiff
          key={fileName}
          fileName={fileName}
          componentId={compareModel?.id}
          view={view}
          dataFileId={componentIdStr ? `${componentIdStr}:${fileName}` : undefined}
        />
      ))}
    </div>
  );
}

function NewFileDiff({
  fileName,
  componentId,
  view,
  dataFileId,
}: {
  fileName: string;
  componentId: any;
  view: DiffViewMode;
  dataFileId?: string;
}) {
  const { fileContent, loading } = useFileContent(componentId, fileName);

  if (loading) {
    return (
      <div data-file-id={dataFileId} style={CELL_WRAP}>
        <DiffLoadingSkeleton />
      </div>
    );
  }

  if (!fileContent) return null;

  return (
    <div data-file-id={dataFileId} style={CELL_WRAP}>
      <DiffViewer
        fileName={fileName}
        oldContent=""
        newContent={fileContent}
        status="new"
        view={view}
        showViewToggle={false}
        virtualize={false}
        wrap
      />
    </div>
  );
}
