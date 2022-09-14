import React from 'react';
import { ComponentsDrawer, ComponentFiltersSlot, DrawerWidgetSlot } from '@teambit/component.ui.component-drawer';
import {
  ComponentView,
  NamespaceTreeNode,
  PayloadType,
  ScopePayload,
  ScopeTreeNode,
} from '@teambit/ui-foundation.ui.side-bar';
import { TreeNodeProps } from '@teambit/design.ui.tree';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import { ComponentModel } from '@teambit/component';
import { ScopeModel } from '@teambit/scope.models.scope-model';
import { useScope } from '@teambit/scope.ui.hooks.scope-context';
import { WorkspaceModel } from '@teambit/workspace';
import { SidebarSlot } from './scope.ui.runtime';

export type ScopeDrawerProps = {
  treeWidgets: SidebarSlot;
  filtersSlot: ComponentFiltersSlot;
  drawerWidgetSlot: DrawerWidgetSlot;
  assumeScopeInUrl?: boolean;
  overrideUseComponents?: () => { components: ComponentModel[] };
};

export const scopeDrawer = ({
  treeWidgets,
  filtersSlot,
  drawerWidgetSlot,
  assumeScopeInUrl = false,
  overrideUseComponents,
}: ScopeDrawerProps) => {
  const customScopeTreeNodeRenderer = (treeNodeSlot, host?: ScopeModel | WorkspaceModel) =>
    function TreeNode(props: TreeNodeProps<PayloadType>) {
      const children = props.node.children;

      if (!children) return <ComponentView {...props} treeNodeSlot={treeNodeSlot} />;

      // skip over scope node and render only children
      if (props.node.payload instanceof ScopePayload) {
        const scopeNameFromNode = props.node.id.slice(0, -1);
        const scope = host?.name;

        /**
         * this is only valid when viewing component from a lane
         * if the lane component is from a different scope than the current scope
         * show the scope node
         */
        if (scopeNameFromNode !== scope) {
          return <ScopeTreeNode {...props} />;
        }

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
    useHost: () => useScope(),
    emptyMessage: 'Scope is empty',
    useComponents:
      overrideUseComponents ||
      (() => {
        const { lanesModel, loading: lanesLoading } = useLanes();
        const viewedLaneId = lanesModel?.viewedLane?.id;

        const { components = [], loading: laneCompsLoading } = useLaneComponents(viewedLaneId);

        return {
          loading: lanesLoading || laneCompsLoading,
          components,
        };
      }),
  });
};
