import React from 'react';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { CompareStatusResolver, CompareStatus } from '@teambit/component.ui.component-compare.status-resolver';
import { WordSkeleton } from '@teambit/base-ui.loaders.skeleton';

import styles from './code-compare.module.scss';

export function Widget({ node }: WidgetProps<any>) {
  const fileName = node.id;
  const componentCompareContext = useComponentCompare();

  if (!componentCompareContext || componentCompareContext.fileCompareDataByName === null) return null;
  if (componentCompareContext.fileCompareDataByName === undefined)
    return <WordSkeleton className={styles.loader} length={5} />;

  const { fileCompareDataByName } = componentCompareContext;

  const codeCompareDataForFile = fileCompareDataByName.get(fileName);

  if (componentCompareContext?.compare && !componentCompareContext.base && !codeCompareDataForFile?.status)
    return <CompareStatusResolver status={'new'} />;

  if (!codeCompareDataForFile || !codeCompareDataForFile.status || codeCompareDataForFile.status === 'UNCHANGED')
    return null;

  return <CompareStatusResolver status={codeCompareDataForFile.status?.toLowerCase() as CompareStatus} />;
}
