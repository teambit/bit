import React, { HTMLAttributes, useState } from 'react';
import { LaneCompare } from '@teambit/lanes.ui.compare.lane-compare';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { ComponentID } from '@teambit/component-id';
import { CodeCompareSection } from '@teambit/code';
import { AspectsCompareSection } from '@teambit/component-compare';
import { ComponentCompareState } from '@teambit/component.ui.component-compare.models.component-compare-state';

import styles from './lane-compare-page.module.scss';

export type LaneComparePageProps = {
  host: string;
} & HTMLAttributes<HTMLDivElement>;

const getStateId = (base: ComponentID, compare: ComponentID) => `${base.toString()}-${compare.toString()}`;

export type CompareStateSlice = {
  activeId?: string;
};

export type CompareState = { tabs?: CompareStateSlice; code?: CompareStateSlice; aspects?: CompareStateSlice };
export const defaultState: CompareState = {
  tabs: {},
  code: {},
  aspects: {},
};

export function LaneComparePage({ host, ...rest }: LaneComparePageProps) {
  const [internalState, setState] = useState<Map<string, CompareState>>(new Map<string, CompareState>());

  const { lanesModel } = useLanes();
  if (!lanesModel) return null;

  const code = new CodeCompareSection();
  const aspect = new AspectsCompareSection(host);

  const tabs = [
    { ...code, order: code.navigationLink.order, props: code.navigationLink, id: code.navigationLink.children },
    { ...aspect, order: aspect.navigationLink.order, props: aspect.navigationLink, id: aspect.navigationLink.children },
  ];

  const state = (base: ComponentID, compare: ComponentID) => {
    const existingState = internalState.get(getStateId(base, compare));
    const activeId = existingState?.tabs?.activeId || defaultState.tabs?.activeId;

    const element = tabs.find((tab) => tab.id === activeId)?.route.element || code.route.element;
    const stateId = getStateId(base, compare);

    const onTabClicked = (id) =>
      setState((value) => {
        const _existingState = value.get(stateId);
        if (_existingState?.tabs?.activeId) {
          _existingState.tabs.activeId = id;
          value.set(stateId, _existingState);
        } else value.set(stateId, { tabs: { activeId: id } });
        return new Map(value);
      });

    const onCodeNodeClicked = (id: string) =>
      setState((value) => {
        const _existingState = value.get(stateId);
        if (_existingState?.code?.activeId) {
          _existingState.code.activeId = id;
          value.set(stateId, _existingState);
        } else value.set(stateId, { code: { activeId: id } });
        return new Map(value);
      });

    const _state: ComponentCompareState = {
      tabs: {
        activeId,
        element,
        onTabClicked,
      },
      code: {
        activeId: existingState?.code?.activeId,
        onNodeClicked: onCodeNodeClicked,
      },
    };

    return _state;
  };

  const baseLane = lanesModel.lanes[0];
  const compareLane = lanesModel.lanes[1] || baseLane;

  return (
    <div {...rest} className={styles.laneComparePage}>
      <div className={styles.top}>{`Comparing Lane ${baseLane.id.toString()} with ${compareLane.id.toString()}`}</div>
      <div className={styles.bottom}>
        <LaneCompare host={host} tabs={tabs} base={baseLane} compare={compareLane} state={state} />
      </div>
    </div>
  );
}
