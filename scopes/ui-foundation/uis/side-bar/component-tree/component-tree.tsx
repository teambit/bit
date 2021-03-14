import { ComponentModel } from '@teambit/component';
import React, { useMemo } from 'react';
import classNames from 'classnames';
import { TreeContextProvider } from '@teambit/base-ui.graph.tree.tree-context';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { inflateToTree, attachPayload } from '@teambit/base-ui.graph.tree.inflate-paths';
import { TreeNodeContext, TreeNodeRenderer } from '@teambit/base-ui.graph.tree.recursive-tree';
import { RootNode } from '@teambit/base-ui.graph.tree.root-node';
import { textSize } from '@teambit/base-ui.text.text-sizes';
import { PayloadType, ScopePayload } from './payload-type';
import { DefaultTreeNodeRenderer } from './default-tree-node-renderer';
import styles from './component-tree.module.scss';

type ComponentTreeProps = {
  onSelect?: (id: string, event?: React.MouseEvent) => void;
  selected?: string;
  components: ComponentModel[];
  TreeNode?: TreeNodeRenderer<PayloadType>;
};

export function ComponentTree({
  components,
  onSelect,
  selected,
  TreeNode = DefaultTreeNodeRenderer,
}: ComponentTreeProps) {
  const rootNode = useMemo(() => {
    const tree = inflateToTree<ComponentModel, PayloadType>(components, (c) => c.id.toString({ ignoreVersion: true }));

    const payloadMap = calcPayload(components);

    attachPayload(tree, payloadMap);

    return tree;
  }, [components]);

  return (
    <div style={indentStyle(1)}>
      <TreeNodeContext.Provider value={TreeNode}>
        <TreeContextProvider onSelect={onSelect} selected={selected}>
          {rootNode.children?.length === 0 ? (
            <span className={classNames(textSize.xs, styles.emptyScope)}>Scope is empty</span>
          ) : (
            <RootNode node={rootNode} depth={1} />
          )}
        </TreeContextProvider>
      </TreeNodeContext.Provider>
    </div>
  );
}

function calcPayload(components: ComponentModel[]) {
  const payloadMap = new Map<string, PayloadType>(components.map((c) => [c.id.toString({ ignoreVersion: true }), c]));

  const scopeIds = new Set(components.map((x) => x.id.scope).filter((x) => !!x));
  scopeIds.forEach((x) => x && payloadMap.set(`${x}/`, new ScopePayload()));

  return payloadMap;
}
