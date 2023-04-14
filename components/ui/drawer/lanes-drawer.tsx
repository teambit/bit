import React, { useContext, createContext, useState } from 'react';
import classNames from 'classnames';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { LanesModel } from '@teambit/lanes.ui.models';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneTree } from './tree';

import styles from './lanes-drawer.module.scss';

const LaneTreeContext = createContext<{
  collapsed: boolean;
  setCollapsed: (x: boolean) => void;
  canCollapse: boolean;
}>({
  collapsed: true,
  setCollapsed: () => {},
  canCollapse: true,
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
  widgets = [<Widget key={`${LanesModel.drawer.id}-widget`} />];

  constructor(private props: LanesDrawerProps) {}

  isHidden = () => {
    const { lanesModel: lanes } = useLanes();
    const hasLanes = lanes && lanes.lanes.length > 0;
    return !hasLanes;
  };

  Context = ({ children }) => {
    const { lanesModel } = useLanes();
    const isCollapsed = !lanesModel?.viewedLane;
    const [collapsed, setCollapsed] = useState(isCollapsed);
    return (
      <LaneTreeContext.Provider value={{ collapsed, setCollapsed, canCollapse: this.props.showScope }}>
        {children}
      </LaneTreeContext.Provider>
    );
  };

  render = () => {
    const { lanesModel } = useLanes();

    const { collapsed } = useContext(LaneTreeContext);

    if (!lanesModel) return <FullLoader />;

    const { showScope } = this.props;

    if (lanesModel.lanes.length === 0)
      return (
        <span className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>
          There are no lanes in your current workspace
        </span>
      );
    return <LaneTree showScope={showScope} isCollapsed={collapsed} lanesModel={lanesModel}></LaneTree>;
  };
}

function Widget() {
  const { collapsed, setCollapsed, canCollapse } = useContext(LaneTreeContext);
  if (!canCollapse) return null;
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return <img src={icon} className={styles.collapseIcon} onClick={() => setCollapsed(!collapsed)} />;
}
