import { ComponentModel } from '@teambit/component';
import React, { useMemo } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { inflateToTree, attachPayload } from '@teambit/base-ui.graph.tree.inflate-paths';
import { Tree, TreeNodeRenderer } from '@teambit/design.ui.tree';
import { PayloadType, ScopePayload } from './payload-type';
import { DefaultTreeNodeRenderer } from './default-tree-node-renderer';

type ComponentTreeProps = {
  components: ComponentModel[];
  TreeNode?: TreeNodeRenderer<PayloadType>;
  isCollapsed?: boolean;
};

export function ComponentTree({ components, isCollapsed, TreeNode = DefaultTreeNodeRenderer }: ComponentTreeProps) {
  const { pathname } = useLocation();

  const activeComponent = useMemo(() => {
    const path = pathname?.startsWith('/') ? pathname.substring(1) : pathname;
    const active = components.find((x) => {
      // TODO - reuse logic from component.route.ts
      return path && path === x.id.fullName;
    });
    return active?.id.toString({ ignoreVersion: true });
  }, [components, pathname]);

  const rootNode = useMemo(() => {
    const tree = inflateToTree<ComponentModel, PayloadType>(components, (c) => c.id.toString({ ignoreVersion: true }));

    const payloadMap = calcPayload(components);

    attachPayload(tree, payloadMap);

    return tree;
  }, [components]);

  return (
    <div style={indentStyle(1)}>
      <Tree TreeNode={TreeNode} activePath={activeComponent} tree={rootNode} isCollapsed={isCollapsed} />
    </div>
  );
}

function calcPayload(components: ComponentModel[]) {
  const payloadMap = new Map<string, PayloadType>(components.map((c) => [c.id.toString({ ignoreVersion: true }), c]));

  const scopeIds = new Set(components.map((x) => x.id.scope).filter((x) => !!x));
  scopeIds.forEach((x) => x && payloadMap.set(`${x}/`, new ScopePayload()));

  return payloadMap;
}
