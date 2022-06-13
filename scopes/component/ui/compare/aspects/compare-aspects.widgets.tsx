import React from 'react';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { CompareStatusResolver, ComponentAspectData, CompareStatus } from '@teambit/component.ui.compare';
import { isEqual } from 'lodash';
import { useAspectCompare } from './compare-aspects-context';

export function Widget({ node }: WidgetProps<any>) {
  const fileName = node.id;

  const componentCompareAspectsContext = useAspectCompare();

  if (componentCompareAspectsContext?.loading) return null;

  const base = componentCompareAspectsContext?.base;
  const compare = componentCompareAspectsContext?.compare;

  const matchingBaseAspect = base?.find((baseAspect) => baseAspect.aspectId === fileName);
  const matchingCompareAspect = compare?.find((compareAspect) => compareAspect.aspectId === fileName);

  if (!matchingBaseAspect && !matchingCompareAspect) return null;

  const status = getAspectStatus(matchingBaseAspect, matchingCompareAspect);

  if (!status) return null;

  return <CompareStatusResolver status={status as CompareStatus} />;
}

function getAspectStatus(aspectA?: ComponentAspectData, aspectB?: ComponentAspectData): CompareStatus | null {
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
