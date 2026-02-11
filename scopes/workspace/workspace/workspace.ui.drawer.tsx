import React, { useContext, useEffect, useRef } from 'react';
import type { ComponentFiltersSlot, DrawerWidgetSlot } from '@teambit/component.ui.component-drawer';
import { ComponentsDrawer } from '@teambit/component.ui.component-drawer';
import { ComponentView, NamespaceTreeNode, ScopePayload, ScopeTreeNode } from '@teambit/ui-foundation.ui.side-bar';
import type { PayloadType } from '@teambit/ui-foundation.ui.side-bar';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import { useViewedLaneFromUrl } from '@teambit/lanes.hooks.use-viewed-lane-from-url';
import { gql, useQuery } from '@apollo/client';
import type { TreeNodeProps } from '@teambit/design.ui.tree';
import type { ComponentModel } from '@teambit/component';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import type { LanesQuery } from '@teambit/lanes.ui.models.lanes-model';
import { LaneId } from '@teambit/lane-id';
import type { SidebarWidgetSlot } from './workspace.ui.runtime';
import { WorkspaceUIContext } from './ui/workspace/workspace-context';

const WORKSPACE_SHELL_READY_EVENT = 'bit-workspace-shell-ready';

export type WorkspaceDrawerProps = {
  treeWidgets: SidebarWidgetSlot;
  filtersSlot: ComponentFiltersSlot;
  drawerWidgetSlot: DrawerWidgetSlot;
  overrideUseLanes?: () => { lanesModel?: LanesModel; loading?: boolean };
};

const WORKSPACE_DRAWER_LANES = gql`
  query WorkspaceDrawerLanes($viewedLaneId: [String!], $skipViewedLane: Boolean!) {
    lanes {
      viewedLane: list(ids: $viewedLaneId) @skip(if: $skipViewedLane) {
        id {
          name
          scope
        }
        hash
      }
      current {
        id {
          name
          scope
        }
        hash
      }
      default {
        id {
          name
          scope
        }
        hash
      }
    }
  }
`;

function useWorkspaceDrawerLanes(viewedLaneFromUrl?: LaneId) {
  const viewedLaneString = viewedLaneFromUrl?.toString();
  // @ts-ignore - graphql typing mismatch in workspace packages
  const { data, loading } = useQuery<LanesQuery>(WORKSPACE_DRAWER_LANES, {
    variables: {
      viewedLaneId: viewedLaneString ? [viewedLaneString] : undefined,
      skipViewedLane: !viewedLaneString || viewedLaneFromUrl?.isDefault(),
    },
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
    returnPartialData: true,
  });

  const lanesModel = data ? LanesModel.from({ data, viewedLaneId: viewedLaneFromUrl }) : undefined;
  return { lanesModel, loading };
}

export const workspaceDrawer = ({
  treeWidgets,
  filtersSlot,
  drawerWidgetSlot,
  overrideUseLanes: useLanesFromProps,
}: WorkspaceDrawerProps) => {
  const useLanes =
    useLanesFromProps ||
    (() => {
      const viewedLaneFromUrl = useViewedLaneFromUrl();
      // Use a minimal lanes query for drawer rendering to avoid blocking sidebar startup.
      return useWorkspaceDrawerLanes(viewedLaneFromUrl);
    });

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

            if (!children) {
              // non collapse
              return <ComponentView {...props} treeNodeSlot={treeNodeSlot} />;
            }

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
      const didReportShellReadyRef = useRef(false);
      const viewedLaneFromUrl = useViewedLaneFromUrl();
      const { lanesModel, loading: lanesLoading } = useLanes();

      const viewedLaneId = lanesModel?.viewedLane?.id || viewedLaneFromUrl;
      const defaultLane = lanesModel?.getDefaultLane();
      const defaultLaneId =
        defaultLane?.id || (viewedLaneFromUrl ? LaneId.from('main', viewedLaneFromUrl.scope) : undefined);
      const isViewingDefaultLane = !!viewedLaneId && (viewedLaneId.isDefault() || defaultLaneId?.isEqual(viewedLaneId));

      // URL is authoritative for initial render.
      // No lane in URL means workspace versions, which can render immediately.
      const isViewingWorkspaceVersions = !viewedLaneFromUrl || lanesModel?.isViewingCurrentLane();

      const shouldFetchLaneComponents = !isViewingWorkspaceVersions && !!viewedLaneId;
      const shouldFetchMainComponents = !isViewingWorkspaceVersions && !isViewingDefaultLane && !!defaultLaneId;

      const { components: laneComponents = [], loading: laneCompsLoading } = useLaneComponents(
        shouldFetchLaneComponents ? viewedLaneId : undefined,
        { skip: !shouldFetchLaneComponents }
      );

      const { components: mainComponents = [], loading: mainCompsLoading } = useLaneComponents(
        shouldFetchMainComponents ? defaultLaneId : undefined,
        { skip: !shouldFetchMainComponents }
      );

      const { workspace, loading: workspaceLoading } = useContext(WorkspaceUIContext);
      const { components: workspaceComponents } = workspace;

      /**
       * if viewing locally checked out lane, return all components from the workspace
       * when viewing main when locally checked out to another lane, explicitly return components from the "main" lane
       * when viewing another lane when locally checked out to a different lane, return "main" + "lane" components
       * */
      let loading = laneCompsLoading || mainCompsLoading || (lanesLoading && !lanesModel);
      let components = mergeComponents(mainComponents, laneComponents);

      if (isViewingWorkspaceVersions) {
        // Don't wait on lanes — workspace components are available from workspace light query.
        loading = workspaceLoading || (!workspace.name && workspaceComponents.length === 0);
        components = workspaceComponents;
      } else if (isViewingDefaultLane) {
        components = laneComponents;
      }

      useEffect(() => {
        if (typeof window === 'undefined') return;
        if (didReportShellReadyRef.current || loading) return;

        // Signal startup critical path readiness once.
        // Deferred status query listens to this event and runs only afterwards.
        didReportShellReadyRef.current = true;
        window.dispatchEvent(
          new CustomEvent(WORKSPACE_SHELL_READY_EVENT, {
            detail: { timestamp: Date.now() },
          })
        );
      }, [loading, components.length]);

      return {
        loading,
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
