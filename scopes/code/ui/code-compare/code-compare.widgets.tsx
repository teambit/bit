import React from 'react';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { useCodeCompare } from '@teambit/code.ui.code-compare';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { CompareStatusResolver, CompareStatus } from '@teambit/component.ui.component-compare.status-resolver';

export function Widget({ node }: WidgetProps<any>) {
  const fileName = node.id;
  const codeCompareContext = useCodeCompare();
  const componentCompareContext = useComponentCompare();

  const codeCompareDataForFile = codeCompareContext?.fileCompareDataByName.get(fileName);

  if (!codeCompareContext || codeCompareContext.loading) return null;
  if (componentCompareContext?.compare && !componentCompareContext.base && !codeCompareDataForFile?.status)
    return <CompareStatusResolver status={'new'} />;

  if (!codeCompareDataForFile || !codeCompareDataForFile.status || codeCompareDataForFile.status === 'UNCHANGED')
    return null;

  return <CompareStatusResolver status={codeCompareDataForFile.status?.toLowerCase() as CompareStatus} />;
}
