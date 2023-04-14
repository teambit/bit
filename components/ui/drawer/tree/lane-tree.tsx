import React, { useMemo } from 'react';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { Tree, TreeNodeProps, TreeNode } from '@teambit/design.ui.tree';
import { PayloadType, ScopeTreeNode } from '@teambit/ui-foundation.ui.side-bar';
import { LanesModel } from '@teambit/lanes.ui.models';
import { TreeContextProvider } from '@teambit/base-ui.graph.tree.tree-context';
import { LaneTreeNode } from './lane-tree-node';
import styles from './lane-tree.module.scss';

export type LaneTreeProps = {
  isCollapsed?: boolean;
  showScope: boolean;
  lanesModel?: LanesModel;
};

export function LaneTree({ isCollapsed, showScope, lanesModel }: LaneTreeProps) {
  const activeLaneName = lanesModel?.viewedLane?.name;

  const tree: TreeNode<PayloadType> = useMemo(() => laneToTree(lanesModel, { showScope }), [lanesModel?.lanes]);

  return (
    <TreeContextProvider selected={lanesModel?.viewedLane?.id}>
      <div className={styles.laneTreeContainer} style={indentStyle(1)}>
        <Tree TreeNode={LaneTreeNodeRenderer} activePath={activeLaneName} tree={tree} isCollapsed={isCollapsed} />
      </div>
    </TreeContextProvider>
  );
}

function LaneTreeNodeRenderer(props: TreeNodeProps<PayloadType>) {
  const payload = props.node.payload;
  if (!payload) return <ScopeTreeNode {...props} />;
  return <LaneTreeNode {...props} />;
}

function laneToTree(lanesModel: LanesModel | undefined, { showScope }: { showScope: boolean }) {
  const lanesByScope = lanesModel?.lanesByScope;
  const scopes = (lanesByScope && [...lanesByScope.keys()]) || [];
  return {
    id: '',
    children: showScope
      ? scopes.map((scope) => ({
          id: scope,
          children: (lanesByScope?.get(scope) || []).map((lane) => ({
            id: lane.id,
            payload: lane,
          })),
        }))
      : lanesModel?.lanes.map((lane) => ({
          id: lane.id,
          payload: lane,
        })),
  };
}
