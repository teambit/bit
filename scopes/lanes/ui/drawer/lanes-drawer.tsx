import React, { useContext, createContext, useState, useEffect } from 'react';
import classNames from 'classnames';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { LaneTree, useLanesContext, LanesModel } from '@teambit/lanes.ui.lanes';

import styles from './lanes-drawer.module.scss';

const LaneTreeContext = createContext<{
  collapsed: boolean;
  setCollapsed: (x: boolean) => void;
  showScope: boolean;
}>({
  collapsed: true,
  setCollapsed: () => {},
  showScope: true,
});

export type LanesDrawerProps = {
  /**
   * displays the scope name for each lane
   * used in Workspace as a consumer can have multiple lanes across different scopes
   */
  showScope: boolean;
};

export class LanesDrawer implements DrawerType {
  order = LanesModel.drawer.order;
  id = LanesModel.drawer.id;
  name = LanesModel.drawer.name;
  widget = (<Widget />);

  constructor(private props: LanesDrawerProps) {}

  isHidden = () => {
    const lanesContext = useLanesContext();
    const hasLanes = lanesContext?.lanes && lanesContext?.lanes.length > 0;
    return !hasLanes;
  };

  Context = ({ children }) => {
    const lanesContext = useLanesContext();
    const isCollapsed = !lanesContext?.currentLane;
    const [collapsed, setCollapsed] = useState(isCollapsed);
    const [showScope] = useState(this.props.showScope);
    return (
      <LaneTreeContext.Provider value={{ collapsed, setCollapsed, showScope }}>{children}</LaneTreeContext.Provider>
    );
  };

  render = () => {
    const lanesContext = useLanesContext();

    const { collapsed } = useContext(LaneTreeContext);

    if (!lanesContext || !lanesContext.lanes) return <FullLoader />;

    const { lanes } = lanesContext;
    const { showScope } = this.props;

    if (lanes.length === 0)
      return (
        <span className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>
          There are no lanes in your current workspace
        </span>
      );
    return <LaneTree showScope={showScope} isCollapsed={collapsed}></LaneTree>;
  };
}

function Widget() {
  const { collapsed, setCollapsed, showScope } = useContext(LaneTreeContext);
  if (!showScope) return null;
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return <img src={icon} className={styles.collapseIcon} onClick={() => setCollapsed(!collapsed)} />;
}
