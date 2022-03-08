import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import {
  ComponentTree,
  PayloadType,
  ComponentView,
  ScopeTreeNode,
  NamespaceTreeNode,
  ScopePayload,
} from '@teambit/ui-foundation.ui.side-bar';
import { TreeNodeProps } from '@teambit/design.ui.tree';
import React, { useCallback, useContext, useState, createContext } from 'react';
import classNames from 'classnames';
import { ComponentTreeSlot } from '@teambit/component-tree';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { WorkspaceContext } from '../workspace/workspace-context';
import styles from './workspace-components-drawer.module.scss';

const WorkspaceTreeContext = createContext<{ collapsed: boolean; setCollapsed: (x: boolean) => void }>({
  collapsed: true,
  setCollapsed: () => {},
});

export class WorkspaceComponentsDrawer implements DrawerType {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  id = 'workspace-components';
  name = 'COMPONENTS';

  widget = (<Widget />);

  Context = ({ children }) => {
    const [collapsed, setCollapsed] = useState(true);
    return (
      <WorkspaceTreeContext.Provider value={{ collapsed, setCollapsed }}>{children}</WorkspaceTreeContext.Provider>
    );
  };

  render = () => {
    const workspace = useContext(WorkspaceContext);
    const { collapsed } = useContext(WorkspaceTreeContext);
    const { treeNodeSlot } = this;

    const TreeNodeRenderer = useCallback(
      function TreeNode(props: TreeNodeProps<PayloadType>) {
        const children = props.node.children;

        if (!children) return <ComponentView {...props} treeNodeSlot={treeNodeSlot} />; // non collapse

        if (props.node.payload instanceof ScopePayload) return <ScopeTreeNode {...props} />;

        return <NamespaceTreeNode {...props} />;
      },
      [treeNodeSlot]
    );

    if (!workspace) return <FullLoader />;
    if (workspace.components.length === 0) {
      return <span className={classNames(mutedItalic, ellipsis, styles.emptyWorkspace)}>Workspace is empty</span>;
    }

    return <ComponentTree components={workspace.components} isCollapsed={collapsed} TreeNode={TreeNodeRenderer} />;
  };
}

function Widget() {
  const { collapsed, setCollapsed } = useContext(WorkspaceTreeContext);
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return <img src={icon} className={styles.collapseIcon} onClick={() => setCollapsed(!collapsed)} />;
}
