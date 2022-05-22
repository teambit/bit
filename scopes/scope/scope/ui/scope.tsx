import 'reset-css';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { Corner } from '@teambit/ui-foundation.ui.corner';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { TopBar } from '@teambit/ui-foundation.ui.top-bar';
import { Composer, ComponentTuple } from '@teambit/base-ui.utils.composer';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import React, { useReducer } from 'react';
import { Route } from 'react-router-dom';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { ScopeProvider } from '@teambit/scope.ui.hooks.scope-context';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import { ScopeOverview } from './scope-overview';
import styles from './scope.module.scss';
import ScopeUI, { ScopeBadgeSlot, ScopeContextType, CornerSlot, OverviewLineSlot } from '../scope.ui.runtime';

export type ScopeProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
  sidebar: JSX.Element;
  scopeUi: ScopeUI;
  badgeSlot: ScopeBadgeSlot;
  overviewLineSlot: OverviewLineSlot;
  cornerSlot: CornerSlot;
  context: ScopeContextType[];
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
  overviewLineSlot,
  cornerSlot,
  context = [],
  onSidebarTogglerChange,
}: ScopeProps) {
  const { scope } = useScopeQuery();
  const isMobile = useIsMobile();
  const [isSidebarOpen, handleSidebarToggle] = useReducer((x) => !x, !isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;
  if (!scope) {
    return <FullLoader />;
  }
  const CornerOverride = cornerSlot?.values()[0];
  scopeUi.setComponents(scope.components);
  const Context = context.map((ctx) => [ctx, { scope }] as ComponentTuple);

  onSidebarTogglerChange(handleSidebarToggle);

  return (
    <ScopeProvider scope={scope}>
      <Composer components={Context}>
        <div className={styles.scope}>
          <TopBar
            className={styles.topbar}
            Corner={() => {
              if (CornerOverride) return <CornerOverride />;
              return <Corner name={scope.name} className={styles.whiteCorner} />;
            }}
            menu={menuSlot}
          />

          <SplitPane className={styles.main} size={264} layout={sidebarOpenness}>
            <Pane className={styles.sidebar}>{sidebar}</Pane>
            <HoverSplitter className={styles.splitter}>
              <Collapser
                isOpen={isSidebarOpen}
                onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
                onClick={handleSidebarToggle}
                tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} side panel`}
              />
            </HoverSplitter>
            <Pane>
              <SlotRouter slot={routeSlot}>
                <Route index element={<ScopeOverview badgeSlot={badgeSlot} overviewSlot={overviewLineSlot} />} />
              </SlotRouter>
            </Pane>
          </SplitPane>
        </div>
      </Composer>
    </ScopeProvider>
  );
}
