import { ComponentModel, useIdFromLocation } from '@teambit/component';
import React, { useMemo } from 'react';
import { useLocation } from '@teambit/base-react.navigation.link';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { inflateToTree, attachPayload } from '@teambit/base-ui.graph.tree.inflate-paths';
import { Tree, TreeNodeRenderer, TreeNode as TreeNodeType } from '@teambit/design.ui.tree';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { TreeContextProvider } from '@teambit/base-ui.graph.tree.tree-context';
import { PayloadType, ScopePayload } from './payload-type';
import { DefaultTreeNodeRenderer } from './default-tree-node-renderer';

type ComponentTreeProps = {
  components: ComponentModel[];
  transformTree?: (rootNode: TreeNodeType) => TreeNodeType;
  TreeNode?: TreeNodeRenderer<PayloadType>;
  isCollapsed?: boolean;
  assumeScopeInUrl?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentTree({
  components,
  isCollapsed,
  className,
  transformTree,
  // assumeScopeInUrl = false,
  TreeNode = DefaultTreeNodeRenderer,
}: ComponentTreeProps) {
  const { pathname = '/' } = useLocation() || {};
  // override default splat from location when viewing a lane component
  const laneCompUrl = pathname.split(LanesModel.baseLaneComponentRoute.concat('/'))[1];
  const idFromLocation = useIdFromLocation(laneCompUrl);
  const activeComponent = useMemo(() => {
    const active = components.find((x) => {
      return idFromLocation && (idFromLocation === x.id.fullName || idFromLocation === x.id.toStringWithoutVersion());
    });
    return active?.id.toString({ ignoreVersion: true });
  }, [components, pathname]);

  const rootNode = useMemo(() => {
    const tree = inflateToTree<ComponentModel, PayloadType>(components, (c) => c.id.toString({ ignoreVersion: true }));

    const payloadMap = calcPayload(components);

    attachPayload(tree, payloadMap);

    if (transformTree) return transformTree(tree);
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
