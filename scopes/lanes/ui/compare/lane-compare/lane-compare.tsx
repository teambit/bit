import React, { HTMLAttributes } from 'react';
import { ComponentID } from '@teambit/component-id';
import { ComponentCompare, MaybeLazyLoaded, TabItem } from '@teambit/component.ui.component-compare.component-compare';
import { ComponentCompareState } from '@teambit/component.ui.component-compare.models.component-compare-state';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';

import styles from './lane-compare.module.scss';

export type LaneCompareProps = {
  base: LaneModel;
  compare: LaneModel;
  host: string;
  tabs?: MaybeLazyLoaded<TabItem[]>;
  state: (base: ComponentID, compare: ComponentID) => ComponentCompareState;
} & HTMLAttributes<HTMLDivElement>;

export function LaneCompare({ host, compare, base, tabs, state, ...rest }: LaneCompareProps) {
  const baseMap = new Map<string, ComponentID>(base.components.map((c) => [c.toStringWithoutVersion(), c]));
  const compareMap = new Map<string, ComponentID>(compare.components.map((c) => [c.toStringWithoutVersion(), c]));
  const uniqueBase = base.components.filter((componentId) => !compareMap.has(componentId.toStringWithoutVersion()));
  const uniqueCompare = compare.components.filter((componentId) => !baseMap.has(componentId.toStringWithoutVersion()));
  const commonComponents = compare.components.filter((componentId) =>
    baseMap.has(componentId.toStringWithoutVersion())
  );
  const componentsToCompare = commonComponents
    .map((cc) => [
      baseMap.get(cc.toStringWithoutVersion()) as ComponentID,
      compareMap.get(cc.toStringWithoutVersion()) as ComponentID,
    ])
    .concat(
      uniqueBase.map((c) => [
        baseMap.get(c.toStringWithoutVersion()) as ComponentID,
        baseMap.get(c.toStringWithoutVersion()) as ComponentID,
      ])
    )
    .concat(
      uniqueCompare.map((c) => [
        compareMap.get(c.toStringWithoutVersion()) as ComponentID,
        compareMap.get(c.toStringWithoutVersion()) as ComponentID,
      ])
    );

  return (
    <div {...rest} className={styles.laneCompareContainer}>
      {componentsToCompare.map(([baseId, compareId]) => {
        return (
          <ComponentCompare
            key={`lane-compare-component-compare-${baseId.toString()}-${compareId.toString()}`}
            host={host}
            tabs={tabs}
            state={{
              ...state(baseId, compareId),
              versionPicker: {
                element: (
                  <div>
                    {`Comparing Component ${baseId.toStringWithoutVersion()}`}
                    <div>{`${baseId.version} with ${compareId.version}`}</div>
                  </div>
                ),
              },
            }}
            baseId={baseId}
            compareId={compareId}
          />
        );
      })}
    </div>
  );
}
