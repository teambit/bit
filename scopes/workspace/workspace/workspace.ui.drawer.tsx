import { useContext } from 'react';
import { ComponentsDrawer, ComponentFiltersSlot, DrawerWidgetSlot } from '@teambit/component.ui.component-drawer';
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
