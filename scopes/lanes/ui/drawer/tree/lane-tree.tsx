import React, { useMemo, useContext } from 'react';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { Tree, TreeNodeProps, TreeNode } from '@teambit/design.ui.tree';
import { PayloadType, ScopeTreeNode } from '@teambit/ui-foundation.ui.side-bar';
import { LanesContext, LaneModel } from '@teambit/lanes.lanes.ui';
import { TreeContextProvider } from '@teambit/base-ui.graph.tree.tree-context';
import { LaneTreeNode } from './lane-tree-node';

type LaneTreeProps = {
  isCollapsed?: boolean;
  showScope: boolean;
};

export function LaneTree({ isCollapsed, showScope }: LaneTreeProps) {
  const { model, updateCurrentLane } = useContext(LanesContext);
  const lanes = model?.lanes?.list || [];
  const lanesByScope = model?.lanes?.byScope || new Map<string, LaneModel[]>();
  const onSelect = (id: string) => {
    updateCurrentLane?.(lanes?.find((lane) => lane.id === id));
  };
  const activeLaneName = model?.currentLane?.name;

  const tree: TreeNode<PayloadType> = useMemo(() => {
    const scopes = [...lanesByScope.keys()];
    return {
      id: '',
      children: showScope
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
