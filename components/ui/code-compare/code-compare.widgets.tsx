import React from 'react';
import type { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import type { CompareStatus } from '@teambit/component.ui.component-compare.status-resolver';
import { CompareStatusResolver } from '@teambit/component.ui.component-compare.status-resolver';
import { WordSkeleton } from '@teambit/base-ui.loaders.skeleton';

import styles from './code-compare.module.scss';

export function Widget({ node }: WidgetProps<any>) {
  const fileName = node.id;
  const componentCompareContext = useComponentCompare();

  if (!componentCompareContext) return null;
  if (componentCompareContext.fileCompareDataByName === undefined)
    return <WordSkeleton className={styles.loader} length={5} />;

  const { fileCompareDataByName } = componentCompareContext;

  const codeCompareDataForFile = fileCompareDataByName?.get(fileName) ?? null;

  if (componentCompareContext?.compare && !componentCompareContext.base && !codeCompareDataForFile?.status)
    return <CompareStatusResolver status="new" />;

  if (!codeCompareDataForFile || !codeCompareDataForFile.status || codeCompareDataForFile.status === 'UNCHANGED')
    return null;

  return <CompareStatusResolver status={codeCompareDataForFile.status?.toLowerCase() as CompareStatus} />;
}
