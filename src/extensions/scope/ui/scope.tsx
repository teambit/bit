import React, { useState } from 'react';
import gql from 'graphql-tag';
import { Route } from 'react-router-dom';
import { TupleSplitPane } from '@bit/bit.gui.atoms.tuple-split-pane';
import { Layout } from '@bit/bit.rendering.constants.layouts';
import { RouteSlot, SlotRouter } from '../../react-router/slot-router';
import { ScopeOverview } from './scope-overview';
import { FullLoader } from '../../../to-eject/full-loader';
import { ScopeModel } from './scope-model';
import { useDataQuery } from '../../ui/ui/data/use-data-query';
import { ScopeProvider } from './scope-provider';
import { Corner } from '../../../components/stage-components/corner';
import { SideBar } from '../../../components/stage-components/side-bar';
import { TopBar } from '../../../components/stage-components/top-bar';
import { CollapsibleSplitter } from '../../../components/stage-components/splitter';
import styles from './scope.module.scss';

export type ScopeProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
};

// TODO: add env to scope
const SCOPE = gql`
  {
    scope {
      name
      components {
        id {
          name
          version
          scope
        }
      }
    }
  }
`;

/**
 * root component of the scope
 */
export function Scope({ routeSlot, menuSlot }: ScopeProps) {
  // TODO - @oded find a way to reuse the sidebar collapse functionality between scope and workspace
  const [isSidebarOpen, toggleOpenness] = useState(true);
  const { data, loading } = useDataQuery(SCOPE);

  if (loading) {
    return <FullLoader />;
  }

  const handleOpenness = () => {
    toggleOpenness(!isSidebarOpen);
  };

  const scope = ScopeModel.from(data);
  const ids = scope.components.map((component) => component);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;
  return (
    <ScopeProvider scope={scope}>
      <div className={styles.scope}>
        <TopBar Corner={() => <Corner name={scope.name} onClick={handleOpenness} />} menu={menuSlot} />
        <TupleSplitPane max={60} min={10} layout={sidebarOpenness} Splitter={CollapsibleSplitter}>
          <SideBar components={ids} className={styles.sideBar} />
          <div className={styles.main}>
            <SlotRouter slot={routeSlot} />
            <Route exact path="/">
              <ScopeOverview />
            </Route>
          </div>
        </TupleSplitPane>
      </div>
    </ScopeProvider>
  );
}
