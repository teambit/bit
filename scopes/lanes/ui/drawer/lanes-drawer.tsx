import React, { useContext, createContext, useState, useEffect } from 'react';
import classNames from 'classnames';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { LanesModel, LaneTree, useLanesContext } from '@teambit/lanes.ui.lanes';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';

import styles from './lanes-drawer.module.scss';

const LaneTreeContext = createContext<{
  collapsed: boolean;
  setCollapsed: (x: boolean) => void;
}>({
  collapsed: true,
  setCollapsed: () => {},
});

export class LanesDrawer implements DrawerType {
  constructor(private showScope: boolean) {}
  id = 'LANES';
  name = 'LANES';
  widget = (<Widget />);

  Context = ({ children }) => {
    const lanesContext = useLanesContext();
    const isCollapsed = !lanesContext?.model.currentLane;
    const [collapsed, setCollapsed] = useState(isCollapsed);
    return <LaneTreeContext.Provider value={{ collapsed, setCollapsed }}>{children}</LaneTreeContext.Provider>;
  };
  render = () => {
    const lanesContext = useLanesContext();
    const model = lanesContext?.model;
    const updateCurrentLane = lanesContext?.updateCurrentLane;
    const location = useLocation();

    useEffect(() => {
      const currentLane = model?.lanes.find((lane) => {
        const laneUrl = LanesModel.getLaneUrlFromPathname(location.pathname);
        return laneUrl === lane.url;
      });
      if (currentLane?.id !== model?.currentLane?.id) updateCurrentLane?.(currentLane);
    }, [location.pathname]);

    const { collapsed } = useContext(LaneTreeContext);

    if (!model || !model.lanes) return <FullLoader />;
    const { lanes } = model;

    if (lanes.length === 0)
      return (
        <span className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>
          There are no lanes in your current workspace
        </span>
      );
    return <LaneTree showScope={this.showScope} isCollapsed={collapsed}></LaneTree>;
  };
}

function Widget() {
  const { collapsed, setCollapsed } = useContext(LaneTreeContext);
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return <img src={icon} className={styles.collapseIcon} onClick={() => setCollapsed(!collapsed)} />;
}
