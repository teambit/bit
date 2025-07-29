import { ComponentModel, useIdFromLocation } from '@teambit/component';
import React, { useMemo } from 'react';
import { useLocation } from '@teambit/base-react.navigation.link';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { inflateToTree, attachPayload } from '@teambit/base-ui.graph.tree.inflate-paths';
import { Tree, TreeNodeRenderer, TreeNode as TreeNodeType } from '@teambit/design.ui.tree';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { TreeContextProvider } from '@teambit/base-ui.graph.tree.tree-context';
import { LanesContext } from '@teambit/lanes.hooks.use-lanes';
import { PayloadType, ScopePayload } from './payload-type';
import { DefaultTreeNodeRenderer } from './default-tree-node-renderer';

type ComponentTreeProps = {
  components: ComponentModel[];
  transformTree?: (rootNode: TreeNodeType) => TreeNodeType;
  TreeNode?: TreeNodeRenderer<PayloadType>;
  isCollapsed?: boolean;
  lanesModel?: LanesModel;
  // assumeScopeInUrl?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

function calcPayload(components: ComponentModel[]) {
  const payloadMap = new Map<string, PayloadType>(components.map((c) => [c.id.toString({ ignoreVersion: true }), c]));

  const scopeIds = new Set(components.map((x) => x.id.scope).filter((x) => !!x));
  scopeIds.forEach((x) => x && payloadMap.set(`${x}/`, new ScopePayload()));

  return payloadMap;
}

export function ComponentTree({
  components,
  isCollapsed,
  className,
  transformTree,
  lanesModel,
  // assumeScopeInUrl = false,
  TreeNode = DefaultTreeNodeRenderer,
}: ComponentTreeProps) {
  const { pathname = '/' } = useLocation() || {};
  // override default splat from location when viewing a lane component
  const laneCompUrl = pathname.split(LanesModel.baseLaneComponentRoute.concat('/'))[1];
  const idFromLocation = useIdFromLocation(laneCompUrl, true);
  const activeComponent = useMemo(() => {
    const active = components.find((x) => {
      return idFromLocation && (idFromLocation === x.id.fullName || idFromLocation === x.id.toStringWithoutVersion());
    });
    return active?.id.toString({ ignoreVersion: true });
  }, [components.length, pathname]);

  const rootNode = useMemo(() => {
    const tree = inflateToTree<ComponentModel, PayloadType>(components, (c) => c.id.toString({ ignoreVersion: true }));

    const payloadMap = calcPayload(components);

    attachPayload(tree, payloadMap);

    if (transformTree) return transformTree(tree);
    return tree;
  }, [components.length]);

  return (
    <LanesContext.Provider value={{ lanesModel }}>
      <TreeContextProvider>
        <div style={indentStyle(1)} className={className}>
          <Tree TreeNode={TreeNode} activePath={activeComponent} tree={rootNode} isCollapsed={isCollapsed} />
        </div>
      </TreeContextProvider>
    </LanesContext.Provider>
  );
}
