import { ComponentModel } from '@teambit/component';
import React, { useMemo, useEffect } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { inflateToTree, attachPayload } from '@teambit/base-ui.graph.tree.inflate-paths';
import { Tree, useTree, TreeNodeRenderer } from '@teambit/design.ui.tree';
import { PayloadType, ScopePayload } from './payload-type';
import { DefaultTreeNodeRenderer } from './default-tree-node-renderer';

type ComponentTreeProps = {
  components: ComponentModel[];
  TreeNode?: TreeNodeRenderer<PayloadType>;
  // activePath?: string;
};

export function ComponentTree({
  components,
  /* activePath, */ TreeNode = DefaultTreeNodeRenderer,
}: ComponentTreeProps) {
  const { pathname } = useLocation();
  const { setActivePath, activePath } = useTree();
  const activeComponent = useMemo(() => {
    // not stable!! replace startsWith
    return components
      .find((x) => {
        return pathname && pathname.includes(x.id.fullName);
      })
      ?.id.toString({ ignoreVersion: true });
  }, [components, pathname]);

  useEffect(() => {
    setActivePath(activeComponent);
  }, [activeComponent]);
  const rootNode = useMemo(() => {
    const tree = inflateToTree<ComponentModel, PayloadType>(components, (c) => c.id.toString({ ignoreVersion: true }));

    const payloadMap = calcPayload(components);
    // console.log("yaaa", payloadMap)
    attachPayload(tree, payloadMap);

    return tree;
  }, [components]);
  console.log('activeComponent', pathname, activeComponent);
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
