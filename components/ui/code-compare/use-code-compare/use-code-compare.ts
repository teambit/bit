import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import type { ComponentID } from '@teambit/component-id';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';

export type UseCodeCompareProps = {
  fileName: string;
};

export type UseCodeCompareResult = {
  baseId?: ComponentID;
  compareId?: ComponentID;
  originalFileContent?: string;
  modifiedFileContent?: string;
  originalPath: string;
  modifiedPath: string;
  loading?: boolean;
};

export function useCodeCompare({ fileName }: UseCodeCompareProps): UseCodeCompareResult {
  const componentCompareContext = useComponentCompare();
  const comparingLocalChanges = componentCompareContext?.compare?.hasLocalChanges;
  const codeCompareDataForFile = componentCompareContext?.fileCompareDataByName?.get(fileName);
  const loadingFromContext =
    !componentCompareContext ||
    componentCompareContext?.loading ||
    componentCompareContext?.fileCompareDataByName === undefined;
  /**
   * when comparing with workspace changes, query without id
   */
  const compareId = comparingLocalChanges
    ? componentCompareContext?.compare?.model.id.changeVersion(undefined)
    : componentCompareContext?.compare?.model.id;

  const baseId = componentCompareContext?.base?.model.id;
  /**
   * when there is no component to compare with, fetch file content
   */
  const { fileContent: downloadedCompareFileContent, loading: loadingDownloadedCompareFileContent } = useFileContent(
    compareId,
    fileName,
    componentCompareContext?.hidden || loadingFromContext || !!codeCompareDataForFile?.compareContent,
    comparingLocalChanges ? 'teambit.workspace/workspace' : 'teambit.scope/scope'
  );
  const { fileContent: downloadedBaseFileContent, loading: loadingDownloadedBaseFileContent } = useFileContent(
    baseId,
    fileName,
    componentCompareContext?.hidden || loadingFromContext || !!codeCompareDataForFile?.baseContent,
    'teambit.scope/scope'
  );
  const loading =
    loadingFromContext ||
    loadingDownloadedCompareFileContent ||
    loadingDownloadedBaseFileContent ||
    componentCompareContext?.loading;

  const originalFileContent = codeCompareDataForFile?.baseContent || downloadedBaseFileContent;

  const modifiedFileContent = codeCompareDataForFile?.compareContent || downloadedCompareFileContent;
  const originalPath = `${componentCompareContext?.base?.model.id.toString()}-${fileName}`;
  const modifiedPath = `${componentCompareContext?.compare?.model.id.toString()}-${fileName}`;

  return {
    baseId,
    compareId,
    loading,
    originalPath,
    modifiedPath,
    originalFileContent,
    modifiedFileContent,
  };
}
