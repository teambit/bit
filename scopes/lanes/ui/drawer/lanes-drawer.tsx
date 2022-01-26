import React, { useContext, createContext, useState } from 'react';
import classNames from 'classnames';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { getAllLanesQuery, LaneViewModel, LaneTree } from '@teambit/lanes.lanes.ui';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import { flatMap } from 'lodash';
import styles from './lanes-drawer.module.scss';

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
  getLanes: () => { lanes: LaneViewModel[]; lanesByScope: Map<string, LaneViewModel[]> } = () => {
    const { lanes } = getAllLanesQuery();
    // if (this.showAllLanes) {
    return {
      lanes: lanes?.list || [],
      lanesByScope: lanes?.byScope || new Map<string, LaneViewModel[]>(),
    };
    // }
    // const { scope } = useScopeQuery();
    // return {
    //   lanes: scope?.name ? laneState?.lanesByScope?.get(`${scope?.name}`) || [] : [],
    //   lanesByScope: laneState.lanesByScope || new Map<string, LaneViewModel[]>(),
    // };
  };

  render = () => {
    const { lanes, lanesByScope } = this.getLanes();
    if (!lanes) return <FullLoader />;
    if (lanes.length === 0)
      return (
        <span className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>
          There are no lanes in your current workspace
        </span>
      );

    return <LaneTree lanes={lanes} lanesByScope={lanesByScope}></LaneTree>;
  };
}

function Widget() {
  const { collapsed, setCollapsed } = useContext(LaneTreeContext);
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return <img src={icon} className={styles.collapseIcon} onClick={() => setCollapsed(!collapsed)} />;
}
