import 'reset-css';
import pluralize from 'pluralize';
import React, { useState, useMemo, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { Route } from 'react-router-dom';
import type { ComponentModel } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
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
import { Workspace as WorkspaceModel } from './workspace-model';
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

  const { workspace: rawWorkspace } = useWorkspace(reactions);
  // Always render the full layout — never block on loading.
  // Data arrives in ~120ms, so the UI fills in seamlessly with no visible delay.
  const workspace = rawWorkspace || WorkspaceModel.empty();
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

  workspaceUI.setComponents(workspace.components);
  const inIframe = typeof window !== 'undefined' && window.parent && window.parent !== window;

  return (
    <WorkspaceProvider workspace={workspace}>
      {!isMinimal && <NotificationsBinder reactionsRef={reactionsRef} />}
      <PreserveWorkspaceMode>
        <ThemeFromUrlSync />
        {isMinimal && inIframe && <MinimalModeUrlBroadcasterAndListener />}
        <div className={styles.workspaceWrapper}>
          {
            <TopBar
              className={classNames(styles.topbar, styles[themeName], isMinimal && styles.minimal)}
              Corner={() => (
                <Corner
                  className={classNames((isMinimal && styles.minimalCorner) || styles.corner, styles[themeName])}
                  name={isMinimal ? '' : workspace.name}
                  icon={isMinimal ? 'https://static.bit.dev/bit-icons/house.svg' : workspace.icon}
                />
              )}
              // @ts-ignore - getting an error of "Types have separate declarations of a private property 'registerFn'." for some reason after upgrading teambit.harmony/harmony from 0.4.6 to 0.4.7
              menu={menuSlot}
            />
          }
          <SplitPane className={styles.main} size={246} layout={sidebarOpenness}>
            <Pane className={classNames(styles.sidebar, styles[themeName], !isSidebarOpen && styles.closed)}>
              {sidebar}
            </Pane>
            <HoverSplitter className={styles.splitter}>
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
