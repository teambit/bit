import 'reset-css';
import pluralize from 'pluralize';
import React, { useReducer, useMemo } from 'react';
import { Route } from 'react-router-dom';
import type { ComponentModel } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import { useNotifications } from '@teambit/ui-foundation.ui.notifications.notification-context';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { Corner } from '@teambit/ui-foundation.ui.corner';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { TopBar } from '@teambit/ui-foundation.ui.top-bar';

import { useWorkspace } from './use-workspace';
import { WorkspaceOverview } from './workspace-overview';
import { WorkspaceProvider } from './workspace-provider';
import styles from './workspace.module.scss';
import { WorkspaceUI } from '../../workspace.ui.runtime';

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
  const reactions = useComponentNotifications();
  const { workspace } = useWorkspace(reactions);

  const [isSidebarOpen, handleSidebarToggle] = useReducer((x) => !x, true);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;

  onSidebarTogglerChange(handleSidebarToggle);

  if (!workspace) {
    return <div className={styles.emptyContainer}></div>;
  }

  workspaceUI.setComponents(workspace.components);

  return (
    <WorkspaceProvider workspace={workspace}>
      <div className={styles.workspaceWrapper}>
        <TopBar
          className={styles.topbar}
          Corner={() => <Corner name={workspace.name} icon={workspace.icon} />}
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
              <Route index element={<WorkspaceOverview />} />
            </SlotRouter>
          </Pane>
        </SplitPane>
      </div>
    </WorkspaceProvider>
  );
}
function useComponentNotifications() {
  const notifications = useNotifications();

  // memo not really needed, but for peace of mind
  return useMemo(
    () => ({
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
    }),
    [notifications]
  );
}
