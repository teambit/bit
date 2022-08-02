import { ComponentModel } from '@teambit/component';
import React, { useMemo } from 'react';
import { useLocation } from '@teambit/base-react.navigation.link';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { inflateToTree, attachPayload } from '@teambit/base-ui.graph.tree.inflate-paths';
import { Tree, TreeNodeRenderer } from '@teambit/design.ui.tree';
import { TreeContextProvider } from '@teambit/base-ui.graph.tree.tree-context';
import { PayloadType, ScopePayload } from './payload-type';
import { DefaultTreeNodeRenderer } from './default-tree-node-renderer';

const componentIdUrlRegex = '[\\w\\/-]*[\\w-]';

type ComponentTreeProps = {
  components: ComponentModel[];
  TreeNode?: TreeNodeRenderer<PayloadType>;
  isCollapsed?: boolean;
  assumeScopeInUrl?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentTree({
  components,
  isCollapsed,
  className,
  assumeScopeInUrl = false,
  TreeNode = DefaultTreeNodeRenderer,
}: ComponentTreeProps) {
  const { pathname = '/' } = useLocation() || {};

  const activeComponent = useMemo(() => {
    const componentUrlRegex = new RegExp(componentIdUrlRegex);
    const path = pathname?.startsWith('/') ? pathname.substring(1) : pathname;
    const rawMatcher = path.match(componentUrlRegex)?.[0]; // returns just the part that matches the componentId section without /~compositions etc.
    const matcher = assumeScopeInUrl ? rawMatcher?.split('/').slice(2).join('/') : rawMatcher;
    const active = components.find((x) => {
      return matcher && matcher === x.id.fullName;
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
    <TreeContextProvider>
      <div style={indentStyle(1)} className={className}>
        <Tree TreeNode={TreeNode} activePath={activeComponent} tree={rootNode} isCollapsed={isCollapsed} />
      </div>
    </TreeContextProvider>
  );
}

function calcPayload(components: ComponentModel[]) {
  const payloadMap = new Map<string, PayloadType>(components.map((c) => [c.id.toString({ ignoreVersion: true }), c]));

  const scopeIds = new Set(components.map((x) => x.id.scope).filter((x) => !!x));
  scopeIds.forEach((x) => x && payloadMap.set(`${x}/`, new ScopePayload()));

  return payloadMap;
}
