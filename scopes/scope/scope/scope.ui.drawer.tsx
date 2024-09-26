import React, { useContext } from 'react';
import { ComponentsDrawer, ComponentFiltersSlot, DrawerWidgetSlot } from '@teambit/component.ui.component-drawer';
import { ComponentView, NamespaceTreeNode, ScopeTreeNode, ScopePayload } from '@teambit/ui-foundation.ui.side-bar';
import type { PayloadType } from '@teambit/ui-foundation.ui.side-bar';
import { TreeNode as TreeNodeType, TreeNodeProps } from '@teambit/design.ui.tree';
import { useLanes as defaultUseLanesHook } from '@teambit/lanes.hooks.use-lanes';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import { ComponentModel } from '@teambit/component';
import { useScope, ScopeContext } from '@teambit/scope.ui.hooks.scope-context';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { SidebarSlot } from './scope.ui.runtime';

export type ScopeDrawerProps = {
  treeWidgets: SidebarSlot;
  filtersSlot: ComponentFiltersSlot;
  drawerWidgetSlot: DrawerWidgetSlot;
  assumeScopeInUrl?: boolean;
  overrideUseComponents?: () => { components: ComponentModel[] };
  overrideUseLanes?: () => { lanesModel?: LanesModel; loading?: boolean };
};

export const scopeDrawer = ({
  treeWidgets,
  filtersSlot,
  drawerWidgetSlot,
  assumeScopeInUrl = false,
  overrideUseComponents,
  overrideUseLanes: useLanesFromProps,
}: ScopeDrawerProps) => {
  const useLanes = useLanesFromProps || defaultUseLanesHook;

  const customScopeTreeNodeRenderer = (treeNodeSlot, host?: any) =>
    function TreeNode(props: TreeNodeProps<PayloadType>) {
      const children = props.node.children;

      if (!children)
        return (
          <ComponentView
            {...props}
            treeNodeSlot={treeNodeSlot}
            /**
             * this is a hack to get around incompatible component id b/w the new sidebar and components in this workspace
             * the new sidebar has been tagged with the new LanesModel component which has been upgraded to a new major component id version
             * which makes it incompatible with all other components in this workspace
             *
             * hopefully when wave gets released it becomes seamless to update all dependents for a given version
             */
            useLanes={useLanes as any}
            scopeName={host?.name}
          />
        );

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
    useLanes,
    emptyMessage: 'Scope is empty',
    // TODO: create an interface for Component host.
    transformTree: (host?: any) => {
      return (rootNode: TreeNodeType) => {
        const thisScopeIndex = rootNode.children?.findIndex((node) => {
          if (!(node.payload instanceof ScopePayload)) return undefined;
          const scopeNameFromNode = node.id.slice(0, -1);
          return scopeNameFromNode === host?.name;
        });

        const thisScope =
          rootNode.children && thisScopeIndex !== undefined ? rootNode.children[thisScopeIndex] : undefined;

        if (thisScope && thisScope.children && rootNode.children) {
          delete rootNode.children[thisScopeIndex as number];
          const children = rootNode.children.concat(thisScope.children);
          rootNode.children = children;
        }

        return rootNode;
      };
    },
    useComponents:
      overrideUseComponents ||
      (() => {
        const { lanesModel, loading: lanesLoading } = useLanes();
        const viewedLaneId = lanesModel?.viewedLane?.id;

        const { components: laneComponents = [], loading: laneCompsLoading } = useLaneComponents(
          viewedLaneId?.isDefault() ? undefined : viewedLaneId
        );
        const { components: mainComponents } = useContext(ScopeContext);
        // lane components + main components
        const components = mergeComponents(mainComponents, laneComponents);

        return {
          loading: lanesLoading || laneCompsLoading,
          components,
        };
      }),
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
