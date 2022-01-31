import React, { useCallback, useState, useContext, createContext } from 'react';
import classNames from 'classnames';
import {
  ComponentTree,
  ComponentView,
  NamespaceTreeNode,
  PayloadType,
  ScopePayload,
} from '@teambit/ui-foundation.ui.side-bar';
import { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';

import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import { ComponentTreeSlot } from '@teambit/component-tree';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import styles from './components-drawer.module.scss';

const ScopeTreeContext = createContext<{ collapsed: boolean; setCollapsed: (x: boolean) => void }>({
  collapsed: true,
  setCollapsed: () => {},
});

export class ComponentsDrawer implements DrawerType {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  id = 'components-drawer';

  name = 'COMPONENTS';

  widget = (<Widget />);

  Context = ({ children }) => {
    const [collapsed, setCollapsed] = useState(true);
    return <ScopeTreeContext.Provider value={{ collapsed, setCollapsed }}>{children}</ScopeTreeContext.Provider>;
  };

  render = () => {
    const { scope } = useScopeQuery();
    const { collapsed } = useContext(ScopeTreeContext);
    const { treeNodeSlot } = this;

    const TreeNodeRenderer = useCallback(
      function TreeNode(props: TreeNodeProps<PayloadType>) {
        const children = props.node.children;

        if (!children) return <ComponentView {...props} treeNodeSlot={treeNodeSlot} />;

        // skip over scope node and render only children
        if (props.node.payload instanceof ScopePayload) {
          return (
            <>
              {children.map((childNode) => (
                <TreeNodeRenderer key={childNode.id} {...props} node={childNode}></TreeNodeRenderer>
              ))}
            </>
          );
        }

        return <NamespaceTreeNode {...props} />;
      },
      [treeNodeSlot]
    );

    if (!scope) return <FullLoader />;
    if (scope.components.length === 0)
      return <span className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>Scope is empty</span>;
    return <ComponentTree components={scope.components} isCollapsed={collapsed} TreeNode={TreeNodeRenderer} />;
  };
}

function Widget() {
  const { collapsed, setCollapsed } = useContext(ScopeTreeContext);
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return <img src={icon} className={styles.collapseIcon} onClick={() => setCollapsed(!collapsed)} />;
}
