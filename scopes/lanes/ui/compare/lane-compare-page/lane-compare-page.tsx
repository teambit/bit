import React, { HTMLAttributes, useState } from 'react';
import { LaneCompare } from '@teambit/lanes.ui.compare.lane-compare';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { CodeCompare } from '@teambit/code.ui.code-compare';
import { ComponentID } from '@teambit/component-id';
import { TabItem } from '@teambit/component.ui.component-compare.component-compare';
import { CodeCompareSection } from '@teambit/code';
import { AspectsCompareSection } from '@teambit/component-compare';

export type LaneComparePageProps = {
  host: string;
} & HTMLAttributes<HTMLDivElement>;
const getStateId = (base: ComponentID, compare: ComponentID) => `${base.toString()}-${compare.toString()}`;
export function LaneComparePage({ host, ...rest }: LaneComparePageProps) {
  const [internalState, setState] = useState<Map<string, { activeTab: string }>>(
    new Map<string, { activeTab: string }>()
  );
  const { lanesModel } = useLanes();
  if (!lanesModel) return null;

  const code = new CodeCompareSection();
  const aspect = new AspectsCompareSection(host);

  const tabs = [
    { ...code, order: code.navigationLink.order, props: code.navigationLink, id: code.navigationLink.children },
    { ...aspect, order: aspect.navigationLink.order, props: aspect.navigationLink, id: aspect.navigationLink.children },
  ];

  const state = (base: ComponentID, compare: ComponentID) => {
    const activeId = internalState.get(getStateId(base, compare))?.activeTab || code.navigationLink.children;

    return {
      tabs: {
        activeId,
        element: (props) => tabs.find((tab) => tab.id === activeId)?.route.element || code.route.element,
        onTabClicked: (id) => () =>
          setState((value) => {
            const stateId = getStateId(base, compare);
            const existingState = value.get(stateId) || { activeTab: id };
            existingState.activeTab = id;
            value.set(stateId, existingState);
            return new Map(value);
          }),
      },
    };
  };

  const baseLane = lanesModel.lanes[0];
  const compareLane = lanesModel.lanes[1] || baseLane;

  return (
    <div {...rest}>
      <div>Lane Compare Page</div>
      <div>
        <LaneCompare host={host} tabs={tabs} base={baseLane} compare={compareLane} state={state} />
      </div>
    </div>
  );
}
