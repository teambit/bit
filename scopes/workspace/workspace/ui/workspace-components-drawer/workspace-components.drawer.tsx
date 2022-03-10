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
import { Icon } from '@teambit/evangelist.elements.icon';
import { TreeNodeProps } from '@teambit/design.ui.tree';
import React, { useCallback, useContext, useState, createContext } from 'react';
import classNames from 'classnames';
import { ComponentTreeSlot } from '@teambit/component-tree';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Toggle } from '@teambit/design.ui.input.toggle';
import { WorkspaceContext } from '../workspace/workspace-context';
import styles from './workspace-components-drawer.module.scss';

type WorkspaceTreeContextType = {
  collapsed: boolean;
  setCollapsed: (x: boolean) => void;
  filterOpen: boolean;
  setFilterOpen: (open: boolean) => void;
  activeFilters: string[];
  setActiveFilter: (filterId: string) => void;
};
const WorkspaceTreeContext = createContext<WorkspaceTreeContextType>({
  collapsed: true,
  setCollapsed: () => {},
  activeFilters: [],
  setActiveFilter: () => {},
  filterOpen: false,
  setFilterOpen: () => {},
});

export class WorkspaceComponentsDrawer implements DrawerType {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  id = 'workspace-components';
  name = 'COMPONENTS';

  widgets = [<FilterWidget key={'filter-widget'} />, <TreeToggleWidget key={'tree-toggle0widget'} />];

  Context = ({ children }) => {
    const [collapsed, setCollapsed] = useState(true);
    const [activeFilters, setActiveFilters] = useState<string[]>([]);
    const [filterOpen, setFilterOpen] = useState<boolean>(false);

    const handleActiveFilterToggle = (filterId: string) => {
      const isFilterActive = activeFilters.includes(filterId);
      if (isFilterActive) {
        setActiveFilters((list) => list.filter((id) => id !== filterId));
        return;
      }
      setActiveFilters((list) => list.concat(filterId));
    };

    return (
      <WorkspaceTreeContext.Provider
        value={{
          collapsed,
          setCollapsed,
          activeFilters,
          setActiveFilter: handleActiveFilterToggle,
          filterOpen,
          setFilterOpen,
        }}
      >
        {children}
      </WorkspaceTreeContext.Provider>
    );
  };

  Filters = [<DeprecateFilter key={'deprecate-filter'} />];

  render = () => {
    const workspace = useContext(WorkspaceContext);
    const { collapsed, activeFilters } = useContext(WorkspaceTreeContext);
    const { treeNodeSlot } = this;
    const hideDeprecatedComponets = activeFilters.find((activeFilter) => activeFilter === 'deprecate');

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

    const components = hideDeprecatedComponets
      ? workspace.components.filter((component) => !component.deprecation?.isDeprecate)
      : workspace.components;

    if (components.length === 0) {
      return <span className={classNames(mutedItalic, ellipsis, styles.emptyWorkspace)}>Workspace is empty</span>;
    }

    return <ComponentTree components={components} isCollapsed={collapsed} TreeNode={TreeNodeRenderer} />;
  };
}

function TreeToggleWidget() {
  const { collapsed, setCollapsed } = useContext(WorkspaceTreeContext);
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return <img src={icon} className={styles.collapseIcon} onClick={() => setCollapsed(!collapsed)} />;
}

function FilterWidget() {
  const { filterOpen, setFilterOpen } = useContext(WorkspaceTreeContext);
  return (
    <Icon
      className={classNames(styles.filterWidgetIcon, filterOpen && styles.open)}
      of="Ripple_filters"
      onClick={() => setFilterOpen(!filterOpen)}
    />
  );
}

function DeprecateFilter() {
  const { activeFilters, setActiveFilter, filterOpen } = useContext(WorkspaceTreeContext);
  const isActive = activeFilters.includes('deprecate');

  if (!filterOpen) return null;

  return (
    <div className={classNames(styles.deprecateFilter, isActive && styles.active)}>
      <div className={styles.filterIcon}>
        <Icon of="note-deprecated" />
        <span className={styles.filterIconLabel}>Deprecated</span>
      </div>
      <div>
        <Toggle checked={isActive} onInputChanged={() => setActiveFilter('deprecate')} />
      </div>
    </div>
  );
}
