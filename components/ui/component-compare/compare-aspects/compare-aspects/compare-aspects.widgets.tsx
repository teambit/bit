import React from 'react';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { isEqual } from 'lodash';
import { useAspectCompare } from '@teambit/component.ui.component-compare.compare-aspects.context';
import { ComponentAspectData } from '@teambit/component.ui.component-compare.compare-aspects.models.component-compare-aspects-model';
import { CompareStatus, CompareStatusResolver } from '@teambit/component.ui.component-compare.status-resolver';

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
  const isUndefined = (data) => data === undefined;
  const isDeleted = (base, compare) => {
    return isUndefined(compare) && !isUndefined(base);
  };
  const isNew = (base, compare) => {
    return !isUndefined(compare) && isUndefined(base);
  };

  const baseConfig = aspectA?.config;
  const baseData = aspectA?.data;
  const compareConfig = aspectB?.config;
  const compareData = aspectB?.data;

  if (isDeleted(baseConfig, compareConfig) || isDeleted(baseData, compareData)) {
    return 'deleted';
  }
  if (isNew(baseConfig, compareConfig) || isNew(baseData, compareData)) {
    return 'new';
  }
  if (!isEqual(baseConfig, compareConfig) || !isEqual(baseData, compareData)) {
    return 'modified';
  }
  return null;
}
