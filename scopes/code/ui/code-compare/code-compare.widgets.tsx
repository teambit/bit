import React from 'react';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { CompareStatus, CompareStatusResolver } from '@teambit/component.ui.compare';
import { useCodeCompare } from '@teambit/code.ui.code-compare';

export function Widget({ node }: WidgetProps<any>) {
  const fileName = node.id;
  const codeCompareContext = useCodeCompare();
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
