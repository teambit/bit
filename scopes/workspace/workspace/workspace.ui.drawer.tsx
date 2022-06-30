import React, { useContext } from 'react';
import { ComponentsDrawer, ComponentFiltersSlot, DrawerWidgetSlot } from '@teambit/component.ui.component-drawer';
import {
  ComponentView,
  NamespaceTreeNode,
  PayloadType,
  ScopePayload,
  ScopeTreeNode,
} from '@teambit/ui-foundation.ui.side-bar';
import { TreeNodeProps } from '@teambit/design.ui.tree';
import { WorkspaceContext } from './ui/workspace/workspace-context';
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
      const workspace = useContext(WorkspaceContext);
      return {
        loading: !workspace,
        components: workspace.components || [],
      };
    },
  });
