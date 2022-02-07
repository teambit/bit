import React, { useContext, createContext, useState } from 'react';
import classNames from 'classnames';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { LaneTree, LanesHost, LanesContext } from '@teambit/lanes.lanes.ui';

import styles from './lanes-drawer.module.scss';

const LaneTreeContext = createContext<{
  collapsed: boolean;
  setCollapsed: (x: boolean) => void;
}>({
  collapsed: true,
  setCollapsed: () => {},
});

export class LanesDrawer implements DrawerType {
  constructor(private host: LanesHost) {}
  id = 'LANES';
  name = 'LANES';
  widget = (<Widget />);

  Context = ({ children }) => {
    const { model } = useContext(LanesContext);
    const isCollapsed = !model?.currentLane;
    const [collapsed, setCollapsed] = useState(isCollapsed);
    return <LaneTreeContext.Provider value={{ collapsed, setCollapsed }}>{children}</LaneTreeContext.Provider>;
  };
  render = () => {
    const { model } = useContext(LanesContext);
    const { collapsed } = useContext(LaneTreeContext);

    if (!model || !model.lanes) return <FullLoader />;
    const { lanes } = model;

    if (lanes.list.length === 0)
      return (
        <span className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>
          There are no lanes in your current workspace
        </span>
      );
    return <LaneTree isCollapsed={collapsed}></LaneTree>;
  };
}

function Widget() {
  const { collapsed, setCollapsed } = useContext(LaneTreeContext);
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return <img src={icon} className={styles.collapseIcon} onClick={() => setCollapsed(!collapsed)} />;
}
