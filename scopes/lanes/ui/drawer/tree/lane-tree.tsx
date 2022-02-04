import React, { useMemo, useContext } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { Tree, TreeNodeProps, TreeNode } from '@teambit/design.ui.tree';
import { PayloadType, ScopeTreeNode } from '@teambit/ui-foundation.ui.side-bar';
import { LanesContext, LaneModel } from '@teambit/lanes.lanes.ui';
import { TreeContextProvider } from '@teambit/base-ui.graph.tree.tree-context';
import { LaneTreeNode } from './lane-tree-node';

type LaneTreeProps = {
  isCollapsed?: boolean;
};

export function LaneTree({ isCollapsed }: LaneTreeProps) {
  const { model, updateCurrentLane } = useContext(LanesContext);
  const host = model?.host;
  const { pathname } = useLocation();
  const lanes = model?.lanes?.list || [];
  const lanesByScope = model?.lanes?.byScope || new Map<string, LaneModel[]>();
  const onSelect = (id: string) => {
    updateCurrentLane(lanes?.find((lane) => lane.id === id));
  };
  const activeLaneName = useMemo(() => {
    const matchingLane = lanes?.find((lane) => {
      return pathname && pathname.includes(`~lanes/${lane.id}`);
    });
    return matchingLane?.id;
  }, [lanes, pathname]);

  const tree: TreeNode<PayloadType> = useMemo(() => {
    const scopes = [...lanesByScope.keys()];
    return {
      id: '',
      children:
        host === 'workspace'
          ? scopes.map((scope) => ({
              id: scope,
              children: (lanesByScope.get(scope) || []).map((lane) => ({
                id: lane.id,
                payload: lane,
              })),
            }))
          : lanes.map((lane) => ({
              id: lane.id,
              payload: lane,
            })),
    };
  }, [lanes]);
  return (
    <TreeContextProvider onSelect={onSelect} selected={model?.currentLane?.id}>
      <div style={indentStyle(1)}>
        <Tree TreeNode={DefaultTreeNodeRenderer} activePath={activeLaneName} tree={tree} isCollapsed={isCollapsed} />
      </div>
    </TreeContextProvider>
  );
}

function DefaultTreeNodeRenderer(props: TreeNodeProps<PayloadType>) {
  const payload = props.node.payload;
  if (!payload) return <ScopeTreeNode {...props} />;
  return <LaneTreeNode {...props} />;
}
