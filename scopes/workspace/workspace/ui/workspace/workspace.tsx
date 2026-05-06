import 'reset-css';
import pluralize from 'pluralize';
import React, { useState, useMemo, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { Route, Link, useLocation, useSearchParams } from 'react-router-dom';
import type { ComponentModel } from '@teambit/component';
import { useIdFromLocation } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { useNotifications } from '@teambit/ui-foundation.ui.notifications.notification-context';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import type { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { Corner } from '@teambit/ui-foundation.ui.corner';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useThemePicker } from '@teambit/base-react.themes.theme-switcher';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { TopBar } from '@teambit/ui-foundation.ui.top-bar';
import { PreserveWorkspaceMode } from '@teambit/workspace.ui.preserve-workspace-mode';
import classNames from 'classnames';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { useUrlChangeBroadcaster } from '@teambit/workspace.hooks.use-url-change-broadcaster';
import { useNavigationMessageListener } from '@teambit/workspace.hooks.use-navigation-message-listener';

import { useWorkspace } from './use-workspace';
import { WorkspaceOverview } from './workspace-overview';
import { WorkspaceProvider } from './workspace-provider';
import styles from './workspace.module.scss';
import type { WorkspaceUI } from '../../workspace.ui.runtime';
import { ThemeFromUrlSync } from './theme-from-url';

export type WorkspaceProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
  sidebar: JSX.Element;
  workspaceUI: WorkspaceUI;
  onSidebarTogglerChange: (callback: () => void) => void;
};

/**
 * main workspace component.
 */
export function Workspace({ routeSlot, menuSlot, sidebar, workspaceUI, onSidebarTogglerChange }: WorkspaceProps) {
  const { isMinimal } = useWorkspaceMode();

  const reactionsRef = useRef<{
    onComponentAdded: (comps: ComponentModel[]) => void;
    onComponentRemoved: (ids: ComponentID[]) => void;
  }>({
    onComponentAdded: () => {},
    onComponentRemoved: () => {},
  });

  const reactions = useMemo(
    () => ({
      onComponentAdded: (comps: ComponentModel[]) => reactionsRef.current.onComponentAdded(comps),
      onComponentRemoved: (ids: ComponentID[]) => reactionsRef.current.onComponentRemoved(ids),
    }),
    []
  );

  const { workspace } = useWorkspace(reactions);
  const theme = useThemePicker();
  const currentTheme = theme?.current;
  const [isSidebarOpen, setSidebarOpen] = useState<boolean | null>(null);
  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;
  const themeName = currentTheme?.themeName || 'light';
  onSidebarTogglerChange(handleSidebarToggle);

  useEffect(() => {
    if (!window) return;
    if (window.innerWidth <= 1024) {
      setSidebarOpen(false);
    }
  }, []);

  useLayoutEffect(() => {
    setSidebarOpen(!isMinimal);
  }, [isMinimal]);

  if (!workspace) {
    return <div className={styles.emptyContainer}></div>;
  }

  workspaceUI.setComponents(workspace.components);
  const inIframe = typeof window !== 'undefined' && window.parent && window.parent !== window;
  const location = useLocation();
  const isOverview = location.pathname === '/' || location.pathname === '';
  const showTopBar = !isMinimal || (isMinimal && !isOverview);

  return (
    <WorkspaceProvider workspace={workspace}>
      {!isMinimal && <NotificationsBinder reactionsRef={reactionsRef} />}
      <PreserveWorkspaceMode>
        <ThemeFromUrlSync />
        {isMinimal && inIframe && <MinimalModeUrlBroadcasterAndListener />}
        <div className={styles.workspaceWrapper}>
          {showTopBar && (
            <TopBar
              className={classNames(styles.topbar, styles[themeName], isMinimal && styles.minimal)}
              Corner={() => (
                <div className={classNames(isMinimal && styles.cornerWithBreadcrumb)}>
                  <Corner
                    className={classNames((isMinimal && styles.minimalCorner) || styles.corner, styles[themeName])}
                    name={isMinimal ? '' : workspace.name}
                    icon={isMinimal ? 'https://static.bit.dev/brands/bit-logo-min.png' : workspace.icon}
                  />
                  {isMinimal && <WorkspaceBreadcrumb />}
                </div>
              )}
              // @ts-ignore - getting an error of "Types have separate declarations of a private property 'registerFn'." for some reason after upgrading teambit.harmony/harmony from 0.4.6 to 0.4.7
              menu={menuSlot}
            />
          )}
          <SplitPane className={styles.main} size={246} layout={sidebarOpenness}>
            <Pane className={classNames(styles.sidebar, styles[themeName], !isSidebarOpen && styles.closed)}>
              {sidebar}
            </Pane>
            <HoverSplitter
              className={classNames(styles.splitter, isMinimal && !isSidebarOpen && styles.splitterClosed)}
            >
              <Collapser
                isOpen={Boolean(isSidebarOpen)}
                onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
                onClick={handleSidebarToggle}
                tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} side panel`}
              />
            </HoverSplitter>
            <Pane>
              <SlotRouter slot={routeSlot}>
                <Route index element={<WorkspaceOverview />} />
              </SlotRouter>
            </Pane>
          </SplitPane>
        </div>
      </PreserveWorkspaceMode>
    </WorkspaceProvider>
  );
}

function NotificationsBinder({
  reactionsRef,
}: {
  reactionsRef: React.MutableRefObject<{
    onComponentAdded: (comps: ComponentModel[]) => void;
    onComponentRemoved: (ids: ComponentID[]) => void;
  }>;
}) {
  const notifications = useNotifications();

  const notificationsMapped = useMemo(() => {
    return {
      onComponentAdded: (comps: ComponentModel[]) => {
        const notificationId = notifications.log(
          `added ${pluralize('component', comps.length)}: ${comps.map((comp) => comp.id.toString()).join(', ')}`
        );
        setTimeout(() => notifications.dismiss(notificationId), 12 * 1000);
      },
      onComponentRemoved: (ids: ComponentID[]) => {
        const notificationId = notifications.log(
          `removed ${pluralize('component', ids.length)} ${ids.map((id) => id.toString()).join(', ')}`
        );
        setTimeout(() => notifications.dismiss(notificationId), 12 * 1000);
      },
    };
  }, [notifications]);

  useEffect(() => {
    reactionsRef.current = notificationsMapped;
    return () => {
      reactionsRef.current = { onComponentAdded: () => {}, onComponentRemoved: () => {} };
    };
  }, [notificationsMapped, reactionsRef]);

  return null;
}

export function MinimalModeUrlBroadcasterAndListener() {
  useUrlChangeBroadcaster();
  useNavigationMessageListener();
  return null;
}

/**
 * Extracts the component fullName from the URL.
 * For lane URLs (`/~lane/scope/lane/~component/...`), extracts the path after ~component/
 * and passes it to useIdFromLocation. For regular URLs, useIdFromLocation handles it directly.
 */
function useComponentFullNameFromUrl(): string | undefined {
  const { pathname } = useLocation();
  const laneComponentUrl = useMemo(() => {
    const marker = LanesModel.baseLaneComponentRoute.replace(/^\//, '') + '/';
    const idx = pathname.indexOf(marker);
    if (idx !== -1) return pathname.slice(idx + marker.length);
    if (pathname.includes(LanesModel.lanesPrefix)) return ''; // lane page, no component
    return undefined;
  }, [pathname]);

  return useIdFromLocation(laneComponentUrl || undefined);
}

function WorkspaceBreadcrumb() {
  const fullName = useComponentFullNameFromUrl();
  const [searchParams] = useSearchParams();
  if (!fullName) return null;

  const parts = fullName.split('/');
  const isLast = (i: number) => i === parts.length - 1;

  return (
    <span className={styles.breadcrumb}>
      {parts.map((part, i) => {
        // build the namespace from all segments up to this one
        const namespace = parts.slice(0, i + 1).join('/');
        const overviewParams = new URLSearchParams(searchParams);
        overviewParams.set('aggregation', 'none');
        overviewParams.set('ns', namespace);

        return (
          <React.Fragment key={i}>
            {i > 0 && <span className={styles.breadcrumbSeparator}>/</span>}
            {isLast(i) ? (
              <span className={styles.breadcrumbLast}>{part}</span>
            ) : (
              <Link to={`/?${overviewParams.toString()}`} className={styles.breadcrumbLink}>
                {part}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </span>
  );
}
