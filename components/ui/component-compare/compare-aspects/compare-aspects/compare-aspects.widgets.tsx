import React from 'react';
import type { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { isEqual } from 'lodash';
import { useAspectCompare } from '@teambit/component.ui.component-compare.compare-aspects.context';
import type { ComponentAspectData } from '@teambit/component.ui.component-compare.compare-aspects.models.component-compare-aspects-model';
import { CompareStatusResolver } from '@teambit/component.ui.component-compare.status-resolver';
import type { CompareStatus } from '@teambit/component.ui.component-compare.status-resolver';

export function Widget({ node }: WidgetProps<any>) {
  const fileName = node.id;

  const componentCompareAspectsContext = useAspectCompare();

  if (componentCompareAspectsContext?.loading) return null;

  const base = componentCompareAspectsContext?.base;
  const compare = componentCompareAspectsContext?.compare;

  const matchingBaseAspect = base?.find((baseAspect) => baseAspect.id === fileName);
  const matchingCompareAspect = compare?.find((compareAspect) => compareAspect.id === fileName);

  if (!matchingBaseAspect && !matchingCompareAspect) return null;

  const status = getAspectStatus(matchingBaseAspect, matchingCompareAspect);

  if (!status) return null;

  return <CompareStatusResolver status={status as CompareStatus} />;
}

export function getAspectStatus(aspectA?: ComponentAspectData, aspectB?: ComponentAspectData): CompareStatus | null {
  if (aspectA && !aspectB) return 'deleted';
  if (!aspectA && aspectB) return 'new';
  if (!aspectA || !aspectB) return null;

  const baseConfig = aspectA.config;
  const baseData = aspectA.data;
  const compareConfig = aspectB.config;
  const compareData = aspectB.data;

  if (!isEqual(baseConfig, compareConfig) || !isEqual(baseData, compareData)) {
    return 'modified';
  }
  return null;
}
