import React, { useMemo, useContext } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { Tree, TreeNodeProps, TreeNode } from '@teambit/design.ui.tree';
import { ComponentView, NamespaceTreeNode, PayloadType, ScopeTreeNode } from '@teambit/ui-foundation.ui.side-bar';
import { LanesContext, LaneModel } from '@teambit/lanes.lanes.ui';
import { ComponentModel } from '@teambit/component';
import { LaneTreeNode } from './lane-tree-node';

type LaneTreeProps = {
  isCollapsed?: boolean;
};

export function LaneTree({ isCollapsed }: LaneTreeProps) {
  const lanesState = useContext(LanesContext);
  const { pathname } = useLocation();
  const lanes = lanesState?.lanes?.list || [];
  const lanesByScope = lanesState?.lanes?.byScope || new Map<string, LaneModel[]>();

  const activeLane = useMemo(() => {
    return lanes?.find((x) => {
      return pathname && pathname.includes(`~lanes/${x.name}`);
    })?.name;
  }, [lanes, pathname]);

  const tree: TreeNode<PayloadType> = useMemo(() => {
    const scopes = [...lanesByScope.keys()];
    return {
      id: '',
      children:
        scopes.length > 0
          ? scopes.map((scope) => ({
              id: scope,
              children: (lanesByScope.get(scope) || []).map((lane) => ({
                id: lane.laneName,
                payload: lane,
                children: lane.components.map((laneComponent) => ({
                  id: laneComponent.id.toString({ ignoreVersion: false }),
                  payload: laneComponent,
                })),
              })),
            }))
          : lanes.map((lane) => ({
              id: lane.laneName,
              payload: lane,
              children: lane.components.map((laneComponent) => ({
                id: laneComponent.id._legacy.toString(),
                payload: laneComponent,
              })),
            })),
    };
  }, [lanes]);

  return (
    <div style={indentStyle(1)}>
      <Tree TreeNode={DefaultTreeNodeRenderer} activePath={activeLane} tree={tree} isCollapsed={isCollapsed} />
    </div>
  );
}

function DefaultTreeNodeRenderer(props: TreeNodeProps<PayloadType>) {
  const payload = props.node.payload;
  if (!payload) return <ScopeTreeNode {...props} />;
  if (payload instanceof ComponentModel) return <ComponentView {...props} />;
  if (props?.node?.children && props.node.children.length > 0) return <NamespaceTreeNode {...props} />;
  return <LaneTreeNode {...props} />;
}
