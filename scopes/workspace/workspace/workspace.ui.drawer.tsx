import React, { useContext } from 'react';
import { ComponentsDrawer, ComponentFiltersSlot, DrawerWidgetSlot } from '@teambit/component.ui.component-drawer';
import {
  ComponentView,
  NamespaceTreeNode,
  PayloadType,
  ScopePayload,
  ScopeTreeNode,
} from '@teambit/ui-foundation.ui.side-bar';
import { useLanes as defaultUseLanesHook } from '@teambit/lanes.hooks.use-lanes';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import { TreeNodeProps } from '@teambit/design.ui.tree';
import { ComponentModel } from '@teambit/component';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { SidebarWidgetSlot } from './workspace.ui.runtime';
import { WorkspaceContext } from './ui/workspace/workspace-context';

export type WorkspaceDrawerProps = {
  treeWidgets: SidebarWidgetSlot;
  filtersSlot: ComponentFiltersSlot;
  drawerWidgetSlot: DrawerWidgetSlot;
  overrideUseLanes?: () => { lanesModel?: LanesModel; loading?: boolean };
};

export const workspaceDrawer = ({
  treeWidgets,
  filtersSlot,
  drawerWidgetSlot,
  overrideUseLanes: useLanesFromProps,
}: WorkspaceDrawerProps) => {
  const useLanes = useLanesFromProps || defaultUseLanesHook;

  return new ComponentsDrawer({
    order: 0,
    id: 'workspace-components-drawer',
    name: 'COMPONENTS',
    plugins: {
      tree: {
        widgets: treeWidgets,
        customRenderer: (treeNodeSlot) =>
          function TreeNode(props: TreeNodeProps<PayloadType>) {
            const children = props.node.children;

            if (!children) return <ComponentView {...props} treeNodeSlot={treeNodeSlot} useLanes={useLanes} />; // non collapse

            if (props.node.payload instanceof ScopePayload) return <ScopeTreeNode {...props} />;

            return <NamespaceTreeNode {...props} />;
          },
      },
      filters: filtersSlot,
      drawerWidgets: drawerWidgetSlot,
    },
    emptyMessage: 'Workspace is empty',
    useLanes,
    useComponents: () => {
      const { lanesModel, loading: lanesLoading } = useLanes();

      const viewedLaneId = lanesModel?.viewedLane?.id;
      const defaultLane = lanesModel?.getDefaultLane();
      const isViewingDefaultLane = viewedLaneId && defaultLane?.id.isEqual(viewedLaneId);

      const isViewingWorkspaceVersions = lanesModel?.isViewingCurrentLane();

      const { components: laneComponents = [], loading: laneCompsLoading } = useLaneComponents(
        !isViewingWorkspaceVersions ? viewedLaneId : undefined
      );
      const { components: mainComponents = [], loading: mainCompsLoading } = useLaneComponents(
        isViewingDefaultLane ? defaultLane?.id : undefined
      );

      const workspace = useContext(WorkspaceContext);
      const { components: workspaceComponents } = workspace;

      const loading = lanesLoading || laneCompsLoading || mainCompsLoading;

      /**
       * if viewing locally checked out lane, return all components from the workspace
       * when viewing main when locally checked out to another lane, explicitly return components from the "main" lane
       * when viewing another lane when locally checked out to a different lane, return "main" + "lane" components
       * */
      if (isViewingWorkspaceVersions) {
        return {
          loading,
          components: workspaceComponents,
        };
      }

      if (isViewingDefaultLane) {
        return {
          loading,
          components: mainComponents,
        };
      }

      return {
        loading,
        components: mergeComponents(mainComponents, laneComponents),
      };
    },
  });
};

function mergeComponents(mainComponents: ComponentModel[], laneComponents: ComponentModel[]): ComponentModel[] {
  const mainComponentsThatAreNotOnLane = mainComponents.filter((mainComponent) => {
    return !laneComponents.find(
      (laneComponent) => laneComponent.id.toStringWithoutVersion() === mainComponent.id.toStringWithoutVersion()
    );
  });
  return laneComponents.concat(mainComponentsThatAreNotOnLane);
}
