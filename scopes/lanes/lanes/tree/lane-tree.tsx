import React, { useMemo } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { inflateToTree, attachPayload } from '@teambit/base-ui.graph.tree.inflate-paths';
import { Tree, TreeNodeRenderer } from '@teambit/design.ui.tree';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import { PayloadType } from '@teambit/ui-foundation.ui.side-bar';

type LaneTreeProps = {
  lanes: LaneData[];
  TreeNode?: TreeNodeRenderer<PayloadType>;
  isCollapsed?: boolean;
};

export function LaneTree({ lanes, isCollapsed, TreeNode }: LaneTreeProps) {
  const { pathname } = useLocation();
  const activeLane = useMemo(() => {
    return lanes.find((x) => {
      return pathname && pathname.includes(x.name);
    })?.name;
  }, [lanes, pathname]);

  const rootNode = useMemo(() => {
    const tree = inflateToTree<LaneData, PayloadType>(lanes, (lane) => lane.name);

    const payloadMap = calcPayload(lanes);

    attachPayload(tree, payloadMap);

    return tree;
  }, [lanes]);

  return (
    <div style={indentStyle(1)}>
      <Tree TreeNode={TreeNode} activePath={activeLane} tree={rootNode} isCollapsed={isCollapsed} />
    </div>
  );
}

function calcPayload(lanes: LaneData[]) {
  const payloadMap = new Map<string, PayloadType>(lanes.map((c) => [c.name, c as undefined]));

  return payloadMap;
}
