import React from 'react';
import { useRouteMatch } from 'react-router-dom';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { useLanes, LaneComponentCard, useLaneComponents } from '@teambit/lanes.lanes.ui';
import styles from './lanes-overview.module.scss';
import { EmptyLane } from './empty-lane-overview';

function getSelectedLaneName() {
  const {
    params: { laneId },
  } = useRouteMatch<{ laneId?: string }>();
  return laneId;
}

export function LanesOverview() {
  const { lanes } = useLanes();
  const currentLaneName = getSelectedLaneName();
  const currentLane = lanes?.list.find((lane) => lane.name === currentLaneName);

  if (!currentLaneName || !currentLane) return null;
  if (currentLane.components.length === 0) return <EmptyLane name={currentLane.laneName} />;

  return (
    <div className={styles.container}>
      <ComponentGrid>
        {currentLane.components.map((component, index) => {
          return <LaneComponentCard key={index} component={component} />;
        })}
      </ComponentGrid>
    </div>
  );
}
