import React from 'react';
import { ComponentsDrawer, ComponentFiltersSlot, DrawerWidgetSlot } from '@teambit/component.ui.component-drawer';
import {
  ComponentView,
  NamespaceTreeNode,
  PayloadType,
  ScopePayload,
  ScopeTreeNode,
} from '@teambit/ui-foundation.ui.side-bar';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import { TreeNodeProps } from '@teambit/design.ui.tree';
import { ComponentModel } from '@teambit/component';
import { SidebarWidgetSlot } from './workspace.ui.runtime';

export type WorkspaceDrawerProps = {
  treeWidgets: SidebarWidgetSlot;
  filtersSlot: ComponentFiltersSlot;
  drawerWidgetSlot: DrawerWidgetSlot;
};

export const workspaceDrawer = ({ treeWidgets, filtersSlot, drawerWidgetSlot }: WorkspaceDrawerProps) =>
  new ComponentsDrawer({
    order: 0,
    id: 'workspace-components-drawer',
    name: 'COMPONENTS',
    plugins: {
      tree: {
        widgets: treeWidgets,
        customRenderer: (treeNodeSlot) =>
          function TreeNode(props: TreeNodeProps<PayloadType>) {
            const children = props.node.children;

            if (!children) return <ComponentView {...props} treeNodeSlot={treeNodeSlot} />; // non collapse

            if (props.node.payload instanceof ScopePayload) return <ScopeTreeNode {...props} />;

            return <NamespaceTreeNode {...props} />;
          },
      },
      filters: filtersSlot,
      drawerWidgets: drawerWidgetSlot,
    },
    emptyMessage: 'Workspace is empty',
    useComponents: () => {
      // lane components + main components
      const { lanesModel, loading: lanesLoading } = useLanes();
      const viewedLaneId = lanesModel?.viewedLane?.id;
      const defaultLane = lanesModel?.getDefaultLane();
      const isViewingDefaultLane = viewedLaneId && defaultLane?.id.isEqual(viewedLaneId);

      const { components: laneComponents = [], loading: laneCompsLoading } = useLaneComponents(viewedLaneId);
      const { components: mainComponents = [], loading: mainCompsLoading } = useLaneComponents(
        !isViewingDefaultLane ? defaultLane?.id : undefined
      );

      const components = isViewingDefaultLane ? laneComponents : mergeComponents(mainComponents, laneComponents);

      return {
        loading: lanesLoading || laneCompsLoading || mainCompsLoading,
        components,
      };
    },
  });

function mergeComponents(mainComponents: ComponentModel[], laneComponents: ComponentModel[]): ComponentModel[] {
  const mainComponentsThatAreNotOnLane = mainComponents.filter((mainComponent) => {
    return !laneComponents.find(
      (laneComponent) => laneComponent.id.toStringWithoutVersion() === mainComponent.id.toStringWithoutVersion()
    );
  });
  return laneComponents.concat(mainComponentsThatAreNotOnLane);
}
