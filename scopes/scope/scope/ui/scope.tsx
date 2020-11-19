import 'reset-css';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { RouteSlot, SlotRouter } from '@teambit/ui.react-router.slot-router';
import { Corner } from '@teambit/ui.corner';
import { Collapser } from '@teambit/ui.side-bar';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { TopBar } from '@teambit/ui.top-bar';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';
import React, { useReducer } from 'react';
import { Route } from 'react-router-dom';
import { ScopeOverview } from './scope-overview';
import { ScopeProvider } from './scope-provider';
import styles from './scope.module.scss';
import { useScope } from './use-scope';
import ScopeUI, { ScopeBadgeSlot, ScopeContextType } from '../scope.ui.runtime';

export type ScopeProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
  sidebar: JSX.Element;
  scopeUi: ScopeUI;
  badgeSlot: ScopeBadgeSlot;
  context?: ScopeContextType;
  onSidebarTogglerChange: (callback: () => void) => void;
};

/**
 * root component of the scope
 */
export function Scope({
  routeSlot,
  menuSlot,
  sidebar,
  scopeUi,
  badgeSlot,
  context,
  onSidebarTogglerChange,
}: ScopeProps) {
  const { scope } = useScope();
  const [isSidebarOpen, handleSidebarToggle] = useReducer((x) => !x, true);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;
  if (!scope) {
    return <FullLoader />;
  }

  scopeUi.setComponents(scope.components);
  const defaultContext = ({ children }) => <div>{children}</div>;
  const Context = context || defaultContext;

  onSidebarTogglerChange(handleSidebarToggle);

  return (
    <ScopeProvider scope={scope}>
      <Context scope={scope}>
        <div className={styles.scope}>
          <TopBar
            className={styles.topbar}
            Corner={() => <Corner name={scope.name} className={styles.whiteCorner} />}
            menu={menuSlot}
          />

          <SplitPane className={styles.main} size={264} layout={sidebarOpenness}>
            <Pane className={styles.sidebar}>{sidebar}</Pane>
            <HoverSplitter className={styles.splitter}>
              <Collapser
                id="scopeSidebarCollapser"
                isOpen={isSidebarOpen}
                onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
                onClick={handleSidebarToggle}
                tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} side panel`}
              />
            </HoverSplitter>
            <Pane>
              <SlotRouter slot={routeSlot} />
              <Route exact path="/">
                <ScopeOverview badgeSlot={badgeSlot} />
              </Route>
            </Pane>
          </SplitPane>
        </div>
      </Context>
    </ScopeProvider>
  );
}
