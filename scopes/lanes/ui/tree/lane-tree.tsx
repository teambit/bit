import React, { useMemo, useContext } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { Tree, TreeNodeProps, TreeNode } from '@teambit/design.ui.tree';
import { PayloadType, ScopeTreeNode } from '@teambit/ui-foundation.ui.side-bar';
import { LanesContext, LaneModel } from '@teambit/lanes.lanes.ui';
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
    const { host } = lanesState;
    return {
      id: '',
      children:
        host === 'workspace'
          ? scopes.map((scope) => ({
              id: scope,
              children: (lanesByScope.get(scope) || []).map((lane) => ({
                id: lane.laneName,
                payload: lane,
              })),
            }))
          : lanes.map((lane) => ({
              id: lane.laneName,
              payload: lane,
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
  return <LaneTreeNode {...props} />;
}
