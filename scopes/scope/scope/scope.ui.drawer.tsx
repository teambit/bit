import React, { useContext } from 'react';
import { ComponentsDrawer, ComponentFiltersSlot, DrawerWidgetSlot } from '@teambit/component.ui.component-drawer';
import { ScopeContext } from '@teambit/scope.ui.hooks.scope-context';
import { ComponentView, NamespaceTreeNode, PayloadType, ScopePayload } from '@teambit/ui-foundation.ui.side-bar';
import { TreeNodeProps } from '@teambit/design.ui.tree';
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
      const scope = useContext(ScopeContext);
      return {
        loading: !scope,
        components: scope.components || [],
      };
    },
  });
};
