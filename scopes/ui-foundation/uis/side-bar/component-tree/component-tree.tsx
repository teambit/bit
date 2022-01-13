import { ComponentModel } from '@teambit/component';
import React, { useMemo } from 'react';
import { TreeContextProvider } from '@teambit/base-ui.graph.tree.tree-context';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { inflateToTree, attachPayload } from '@teambit/base-ui.graph.tree.inflate-paths';
import { TreeNodeContext, TreeNodeRenderer } from '@teambit/base-ui.graph.tree.recursive-tree';
import { RootNode } from '@teambit/base-ui.graph.tree.root-node';
import { Tree } from '@teambit/design.ui.tree';
import { PayloadType, ScopePayload } from './payload-type';
import { DefaultTreeNodeRenderer } from './default-tree-node-renderer';

type ComponentTreeProps = {
  components: ComponentModel[];
  TreeNode?: TreeNodeRenderer<PayloadType>;
  activePath?: string;
};

export function ComponentTree({ components, activePath, TreeNode = DefaultTreeNodeRenderer }: ComponentTreeProps) {
  const activeComponent = useMemo(() => {
    // not stable!! replace startsWith
    return components
      .find((x) => activePath && x.id.fullName.startsWith(activePath))
      ?.id.toString({ ignoreVersion: true });
  }, [components]);
  const rootNode = useMemo(() => {
    const tree = inflateToTree<ComponentModel, PayloadType>(components, (c) => c.id.toString({ ignoreVersion: true }));

    const payloadMap = calcPayload(components);
    // console.log("yaaa", payloadMap)
    attachPayload(tree, payloadMap);

    return tree;
  }, [components]);
  // console.log("rootNode", rootNode)
  return (
    <div style={indentStyle(1)}>
      <Tree TreeNode={TreeNode} activePath={activeComponent} tree={rootNode} />
    </div>
  );
}

function calcPayload(components: ComponentModel[]) {
  const payloadMap = new Map<string, PayloadType>(components.map((c) => [c.id.toString({ ignoreVersion: true }), c]));

  const scopeIds = new Set(components.map((x) => x.id.scope).filter((x) => !!x));
  scopeIds.forEach((x) => x && payloadMap.set(`${x}/`, new ScopePayload()));

  return payloadMap;
}
