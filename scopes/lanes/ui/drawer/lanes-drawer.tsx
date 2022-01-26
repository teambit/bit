import React, { useContext, createContext, useState } from 'react';
import classNames from 'classnames';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { getAllLanesQuery, LaneTree } from '@teambit/lanes.lanes.ui';
import styles from './lanes-drawer.module.scss';
import { LanesProvider } from '../hooks/lanes-context/lanes-provider';

const LaneTreeContext = createContext<{ collapsed: boolean; setCollapsed: (x: boolean) => void }>({
  collapsed: true,
  setCollapsed: () => {},
});

export class LanesDrawer implements DrawerType {
  id = 'LANES';
  name = 'LANES';
  widget = (<Widget />);
  Context = ({ children }) => {
    const [collapsed, setCollapsed] = useState(true);
    return <LaneTreeContext.Provider value={{ collapsed, setCollapsed }}>{children}</LaneTreeContext.Provider>;
  };

  render = () => {
    const lanesState = getAllLanesQuery();
    const { collapsed } = useContext(LaneTreeContext);

    const { lanes } = lanesState;

    if (!lanes) return <FullLoader />;
    if (lanes.list.length === 0)
      return (
        <span className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>
          There are no lanes in your current workspace
        </span>
      );

    return (
      <LanesProvider lanesState={lanesState}>
        <LaneTree isCollapsed={collapsed}></LaneTree>
      </LanesProvider>
    );
  };
}

function Widget() {
  const { collapsed, setCollapsed } = useContext(LaneTreeContext);
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return <img src={icon} className={styles.collapseIcon} onClick={() => setCollapsed(!collapsed)} />;
}
