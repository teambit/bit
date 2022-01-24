import React, { useContext, createContext, useState } from 'react';
import classNames from 'classnames';

import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { TreeNodeProps } from '@teambit/design.ui.tree';
import {
  PayloadType,
  ComponentView,
  ScopePayload,
  NamespaceTreeNode,
  ComponentTree,
} from '@teambit/ui-foundation.ui.side-bar';
import { getLanesQuery } from '../hooks/lanes-query/lanes-query';
import styles from './lanes-drawer.module.scss';
import { LaneTree } from '../tree/lane-tree';

const ScopeTreeContext = createContext<{ collapsed: boolean; setCollapsed: (x: boolean) => void }>({
  collapsed: true,
  setCollapsed: () => {},
});

export class LanesDrawer implements DrawerType {
  name = 'LANES';
  widget = (<Widget />);
  Context = ({ children }) => {
    const [collapsed, setCollapsed] = useState(true);
    return <ScopeTreeContext.Provider value={{ collapsed, setCollapsed }}>{children}</ScopeTreeContext.Provider>;
  };

  render = () => {
    const { lanes } = getLanesQuery();
    const { collapsed } = useContext(ScopeTreeContext);
    const TreeNodeRenderer = function TreeNode(props: TreeNodeProps<PayloadType>) {
      const children = props.node.children;

      if (!children) return <ComponentView {...props} />;

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
    };

    if (!lanes) return <FullLoader />;

    if (lanes.length === 0)
      return <span className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>Lane is empty</span>;
    return <LaneTree lanes={lanes} isCollapsed={collapsed} TreeNode={TreeNodeRenderer} />;
  };
}

function Widget() {
  const { collapsed, setCollapsed } = useContext(ScopeTreeContext);
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return <img src={icon} className={styles.collapseIcon} onClick={() => setCollapsed(!collapsed)} />;
}
