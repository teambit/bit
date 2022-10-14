import React, { useReducer, ComponentType, ReactNode } from 'react';
import 'reset-css';
import classNames from 'classnames';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { Corner } from '@teambit/ui-foundation.ui.corner';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { TopBar } from '@teambit/ui-foundation.ui.top-bar';
import { Composer, ComponentTuple } from '@teambit/base-ui.utils.composer';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import { Route } from 'react-router-dom';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { ScopeProvider } from '@teambit/scope.ui.hooks.scope-context';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import { ScopeOverview } from './scope-overview';
import styles from './scope.module.scss';
import ScopeUI, { ScopeBadgeSlot, ScopeContextType, CornerSlot, OverviewLineSlot } from '../scope.ui.runtime';
import { ScopeModel } from '..';

export type ScopeProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
  sidebar: JSX.Element;
  scopeUi: ScopeUI;
  badgeSlot: ScopeBadgeSlot;
  overviewLineSlot: OverviewLineSlot;
  cornerSlot: CornerSlot;
  context: ScopeContextType[];
  TargetScopeOverview?: ComponentType;
  userUseScopeQuery?: () => { scope: ScopeModel | undefined };
  onSidebarTogglerChange: (callback: () => void) => void;
  TargetCorner?: ComponentType;
  paneClassName?: string;
  scopeClassName?: string;
  PaneWrapper?: ComponentType<{ children: ReactNode }>;
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
  PaneWrapper,
  context = [],
  paneClassName,
  TargetScopeOverview,
  TargetCorner,
  onSidebarTogglerChange,
  userUseScopeQuery,
  scopeClassName,
}: ScopeProps) {
  const { scope } = userUseScopeQuery ? userUseScopeQuery() : useScopeQuery();
  const isMobile = useIsMobile();
  const [isSidebarOpen, handleSidebarToggle] = useReducer((x) => !x, !isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;
  if (!scope) {
    return <FullLoader />;
  }
  const CornerOverride = TargetCorner || cornerSlot?.values()[0];
  scopeUi.setComponents(scope.components);
  const Context = context.map((ctx) => [ctx, { scope }] as ComponentTuple);

  onSidebarTogglerChange(handleSidebarToggle);

  return (
    <ScopeProvider scope={scope}>
      <Composer components={Context}>
        <div className={classNames(styles.scope, scopeClassName)}>
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

            {
              /**
               * @hack - discuss with Ran why we need a PaneWrapper as a parent of the Pane
               * conditionally rendering it makes sure that it doesn't break the code tab layout
               */
              (PaneWrapper && (
                <PaneContainer Wrapper={PaneWrapper}>
                  <Pane className={classNames(paneClassName, styles.pane)}>
                    <SlotRouter slot={routeSlot}>
                      <Route
                        index
                        element={
                          <ScopeOverview
                            badgeSlot={badgeSlot}
                            overviewSlot={overviewLineSlot}
                            TargetOverview={TargetScopeOverview}
                          />
                        }
                      />
                    </SlotRouter>
                  </Pane>
                </PaneContainer>
              )) || (
                <Pane className={classNames(paneClassName, styles.pane)}>
                  <SlotRouter slot={routeSlot}>
                    <Route
                      index
                      element={
                        <ScopeOverview
                          badgeSlot={badgeSlot}
                          overviewSlot={overviewLineSlot}
                          TargetOverview={TargetScopeOverview}
                        />
                      }
                    />
                  </SlotRouter>
                </Pane>
              )
            }
          </SplitPane>
        </div>
      </Composer>
    </ScopeProvider>
  );
}

function PaneContainer({
  children,
  Wrapper,
}: {
  children: ReactNode;
  Wrapper: ComponentType<{ children: ReactNode }>;
}) {
  return <Wrapper>{children}</Wrapper>;
}
