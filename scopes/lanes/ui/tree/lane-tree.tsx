import React, { useMemo, useContext } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { Tree, TreeNodeProps, TreeNode } from '@teambit/design.ui.tree';
import { PayloadType, ScopeTreeNode } from '@teambit/ui-foundation.ui.side-bar';
import { LanesContext, LaneViewModel } from '@teambit/lanes.lanes.ui';
import { LaneView } from './lane-view';

type LaneTreeProps = {
  isCollapsed?: boolean;
};

export function LaneTree({ isCollapsed }: LaneTreeProps) {
  const lanesState = useContext(LanesContext);
  const { pathname } = useLocation();
  const lanes = lanesState?.lanes?.list || [];
  const lanesByScope = lanesState?.lanes?.byScope || new Map<string, LaneViewModel[]>();

  const activeLane = useMemo(() => {
    return lanes?.find((x) => {
      return pathname && pathname.includes(`~lanes/${x.name}`);
    })?.name;
  }, [lanes, pathname]);

  const tree: TreeNode<LaneViewModel> = useMemo(() => {
    const scopes = [...lanesByScope.keys()];
    return {
      id: '',
      children:
        scopes.length > 0
          ? scopes.map((scope) => ({
              id: scope,
              children: (lanesByScope.get(scope) || []).map((lane) => ({
                id: lane.name,
                payload: lane,
              })),
            }))
          : lanes.map((lane) => ({ id: lane.laneName, payload: lane })),
    };
  }, [lanes]);
  return (
    <div style={indentStyle(1)}>
      <Tree TreeNode={DefaultTreeNodeRenderer} activePath={activeLane} tree={tree} isCollapsed={isCollapsed} />
    </div>
  );
}

export function DefaultTreeNodeRenderer(props: TreeNodeProps<PayloadType>) {
  const children = props.node.children;
  if (!children) return <LaneView {...props} />;

  return <ScopeTreeNode {...props} />;
}
