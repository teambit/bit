import React, { useMemo } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { Tree, TreeNodeProps, TreeNode } from '@teambit/design.ui.tree';
import { PayloadType, ScopeTreeNode } from '@teambit/ui-foundation.ui.side-bar';
import { LaneViewModel } from '@teambit/lanes.lanes.ui';
import { flatMap } from 'lodash';
import { LaneView } from './lane-view';

type LaneTreeProps = {
  lanes: LaneViewModel[];
  lanesByScope: Map<string, LaneViewModel[]>;
  isCollapsed?: boolean;
  showScope: boolean;
};

export function LaneTree({ lanes, isCollapsed = true, lanesByScope, showScope }: LaneTreeProps) {
  const { pathname } = useLocation();
  const activeLane = useMemo(() => {
    return lanes.find((x) => {
      return pathname && pathname.includes(x.name);
    })?.name;
  }, [lanes, pathname]);

  const tree: TreeNode<LaneViewModel> = useMemo(() => {
    const scopes = [...lanesByScope.keys()];
    return {
      id: '',
      children: showScope
        ? scopes.map((scope) => ({
            id: scope,
            children: (lanesByScope.get(scope) || []).map((lane) => ({
              id: lane.name,
              payload: lane,
            })),
          }))
        : flatMap([...lanesByScope.values()]).map((lane) => ({ id: lane.laneName, payload: lane })),
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
