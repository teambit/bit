import React, { useMemo } from 'react';
import { useComponentCompare, InlineCompareEmpty } from '@teambit/component.ui.component-compare.context';
import { useDiffMode } from '@teambit/component.ui.component-compare.component-compare';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import {
  DiffFileRenderer,
  DiffFileHeader,
  DiffLoadingSkeleton,
  buildFileDiffsFromMap,
  computeNewFileHunks,
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

  const { fileDiffs, newFiles } = useMemo(() => {
    if (!fileCompareDataByName) return { fileDiffs: [], newFiles: [] };
    // NEW files whose content hasn't arrived in the bulk payload are diverted to `newFiles`
    // and fetched lazily by <NewFileDiff/> below.
    const pending: string[] = [];
    const diffs = buildFileDiffsFromMap(fileCompareDataByName, (fileName) => pending.push(fileName));
    return { fileDiffs: diffs, newFiles: pending };
  }, [fileCompareDataByName]);

  if (!componentCompare || componentCompare.loading || fileCompareDataByName === undefined) {
    return <DiffLoadingSkeleton />;
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
        <DiffLoadingSkeleton header={false} />
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
