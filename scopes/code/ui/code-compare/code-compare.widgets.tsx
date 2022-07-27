import React from 'react';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { CompareStatus, CompareStatusResolver } from '@teambit/component.ui.compare';
import { useCodeCompare } from '@teambit/code.ui.code-compare';

export function Widget({ node }: WidgetProps<any>) {
  const fileName = node.id;
  const codeCompareContext = useCodeCompare();
  // const base = componentCompareContext?.base?.model;
  // const compare = componentCompareContext?.compare?.model;
  /**
   * Note: This is temporary for the first release.
   * TBD move this to the Component Compare GQL API
   */
  // const { fileContent: originalFileContent, loading: originalLoading } = useFileContent(base?.id, fileName);
  // const { fileContent: modifiedFileContent, loading: modifiedLoading } = useFileContent(compare?.id, fileName);

  const codeCompareDataForFile = codeCompareContext?.fileCompareDataByName.get(fileName);
  if (
    !codeCompareContext ||
    codeCompareContext.loading ||
    !codeCompareDataForFile ||
    !codeCompareDataForFile.status ||
    codeCompareDataForFile.status === 'UNCHANGED'
  )
    return null;

  return <CompareStatusResolver status={codeCompareDataForFile.status?.toLowerCase() as CompareStatus} />;
}
