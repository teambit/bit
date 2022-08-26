import React from 'react';
import { ComponentsDrawer, ComponentFiltersSlot, DrawerWidgetSlot } from '@teambit/component.ui.component-drawer';
import { ComponentView, NamespaceTreeNode, PayloadType, ScopePayload } from '@teambit/ui-foundation.ui.side-bar';
import { ComponentModel } from '@teambit/component';
import { TreeNodeProps } from '@teambit/design.ui.tree';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import { SidebarSlot } from './scope.ui.runtime';

export type ScopeDrawerProps = {
  treeWidgets: SidebarSlot;
  filtersSlot: ComponentFiltersSlot;
  drawerWidgetSlot: DrawerWidgetSlot;
  assumeScopeInUrl?: boolean;
};

export const scopeDrawer = ({
  treeWidgets,
  filtersSlot,
  drawerWidgetSlot,
  assumeScopeInUrl = false,
}: ScopeDrawerProps) => {
  const customScopeTreeNodeRenderer = (treeNodeSlot) =>
    function TreeNode(props: TreeNodeProps<PayloadType>) {
      const children = props.node.children;

      if (!children) return <ComponentView {...props} treeNodeSlot={treeNodeSlot} />;

      // skip over scope node and render only children
      if (props.node.payload instanceof ScopePayload) {
        return (
          <>
            {children.map((childNode) => (
              <TreeNode key={childNode.id} {...props} node={childNode}></TreeNode>
            ))}
          </>
        );
      }

      return <NamespaceTreeNode {...props} />;
    };

  return new ComponentsDrawer({
    assumeScopeInUrl,
    order: 0,
    id: 'scope-components-drawer',
    name: 'COMPONENTS',
    plugins: {
      tree: {
        widgets: treeWidgets,
        customRenderer: customScopeTreeNodeRenderer,
      },
      filters: filtersSlot,
      drawerWidgets: drawerWidgetSlot,
    },
    emptyMessage: 'Scope is empty',
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
};

function mergeComponents(mainComponents: ComponentModel[], laneComponents: ComponentModel[]): ComponentModel[] {
  const mainComponentsThatAreNotOnLane = mainComponents.filter((mainComponent) => {
    return !laneComponents.find(
      (laneComponent) => laneComponent.id.toStringWithoutVersion() === mainComponent.id.toStringWithoutVersion()
    );
  });
  return laneComponents.concat(mainComponentsThatAreNotOnLane);
}
