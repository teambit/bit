import type { ComponentType } from 'react';
import React, { useMemo } from 'react';
import type { LaneModel, LanesHost } from '@teambit/lanes.ui.models.lanes-model';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import type { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { useLanes as defaultUseLanes } from '@teambit/lanes.hooks.use-lanes';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import flatten from 'lodash.flatten';
import type { SlotRegistry } from '@teambit/harmony';
import type { ComponentModel } from '@teambit/component';
import { LaneDetails } from '@teambit/lanes.ui.lane-details';
import { ComponentsOverview } from '@teambit/explorer.ui.components-overview';
import { EmptyLaneOverview } from './empty-lane-overview';

import styles from './lane-overview.module.scss';

export type LaneOverviewLine = ComponentType;
export type LaneOverviewLineSlot = SlotRegistry<LaneOverviewLine[]>;

export type LaneOverviewProps = {
  routeSlot: RouteSlot;
  overviewSlot?: LaneOverviewLineSlot;
  host: LanesHost;
  useLanes?: () => { lanesModel?: LanesModel; loading?: boolean };
};

export function LaneOverview({
  routeSlot,
  overviewSlot,
  host,
  useLanes: useLanesFromProps = defaultUseLanes,
}: LaneOverviewProps) {
  const { lanesModel } = useLanesFromProps();
  const viewedLane = lanesModel?.viewedLane;

  if (!viewedLane || !viewedLane.id) return null;
  if (viewedLane.components.length === 0) return <EmptyLaneOverview name={viewedLane.id.name} />;

  return <LaneOverviewBody currentLane={viewedLane} host={host} routeSlot={routeSlot} overviewSlot={overviewSlot} />;
}

type LaneOverviewBodyProps = {
  currentLane: LaneModel;
  host: LanesHost;
  routeSlot: RouteSlot;
  overviewSlot?: LaneOverviewLineSlot;
};

function LaneOverviewBody({ currentLane, host: _host, routeSlot, overviewSlot }: LaneOverviewBodyProps) {
  const { loading, components, componentDescriptors } = useLaneComponents(currentLane.id);
  const overviewItems = useMemo(() => flatten(overviewSlot?.values()), [overviewSlot]);

  if (loading) return null;

  const getHref = (component: ComponentModel) => LanesModel.getLaneComponentUrl(component.id, currentLane.id);

  return (
    <ComponentsOverview
      className={styles.container}
      components={components ?? []}
      componentDescriptors={componentDescriptors ?? []}
      getHref={getHref}
      storageNamespace="lane-overview"
      header={
        <LaneDetails
          className={styles.laneDetails}
          laneId={currentLane.id}
          description=""
          componentCount={currentLane.components.length}
        />
      }
      footer={
        <>
          {routeSlot && <SlotRouter slot={routeSlot} />}
          {overviewItems.map((Item, index) => (
            <Item key={index} />
          ))}
        </>
      }
      emptyState={<EmptyLaneOverview name={currentLane.id.name} />}
    />
  );
}
