import { RouteSlot, SlotSubRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import React, { useContext } from 'react';
import { LanesContext, LanesModel } from '@teambit/lanes.lanes.ui';
import { useQuery as useRouterQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import styles from './lane-component.module.scss';

export type LaneComponentProps = {
  routeSlot: RouteSlot;
};

export function LaneComponent({ routeSlot }: LaneComponentProps) {
  const { model } = useContext(LanesContext);
  const { lanes } = model as LanesModel;
  const query = useRouterQuery();
  const version = query.get('version');
  const compHashLookup = lanes?.byComponentHash;
  const component = version ? compHashLookup?.[version] : null;

  return (
    <>
      <h1>HI I am Lane a Component</h1>
      <div className={styles.container}>{routeSlot && <SlotSubRouter slot={routeSlot} />}</div>
    </>
  );
}
