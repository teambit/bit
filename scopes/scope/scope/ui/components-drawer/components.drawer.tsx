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
import { Toggle } from '@teambit/design.ui.input.toggle';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import styles from './components-drawer.module.scss';

type ScopeTreeContextType = {
  collapsed: boolean;
  setCollapsed: (x: boolean) => void;
  filterOpen: boolean;
  setFilterOpen: (open: boolean) => void;
  activeFilters: string[];
  setActiveFilter: (filterId: string) => void;
};

const ScopeTreeContext = createContext<ScopeTreeContextType>({
  collapsed: true,
  setCollapsed: () => {},
  activeFilters: [],
  setActiveFilter: () => {},
  filterOpen: false,
  setFilterOpen: () => {},
});

export class ComponentsDrawer implements DrawerType {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  id = 'components-drawer';

  name = 'COMPONENTS';

  widgets = [<FilterWidget key={'filter-widget'} />, <TreeToggleWidget key={'tree-toggle-widget'} />];
  Filters = [<DeprecateFilter key={'deprecate-filter'} />];

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
      <ScopeTreeContext.Provider
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
      </ScopeTreeContext.Provider>
    );
  };

  render = () => {
    const { scope } = useScopeQuery();
    const { collapsed, activeFilters } = useContext(ScopeTreeContext);
    const { treeNodeSlot } = this;
    const showDeprecatedComponents = activeFilters.find((activeFilter) => activeFilter === 'deprecate');

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

    const components = showDeprecatedComponents
      ? scope.components
      : scope.components.filter((component) => !component.deprecation?.isDeprecate);

    if (components.length === 0)
      return <span className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>Scope is empty</span>;

    return <ComponentTree components={components} isCollapsed={collapsed} TreeNode={TreeNodeRenderer} />;
  };
}

function TreeToggleWidget() {
  const { collapsed, setCollapsed } = useContext(ScopeTreeContext);
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return (
    <div className={styles.widgetIcon}>
      <img src={icon} onClick={() => setCollapsed(!collapsed)} />
    </div>
  );
}

function FilterWidget() {
  const { filterOpen, setFilterOpen } = useContext(ScopeTreeContext);
  return (
    <div className={classNames(styles.widgetIcon, styles.filterWidgetIcon, filterOpen && styles.open)}>
      <img src="https://static.bit.dev/bit-icons/filter.svg" onClick={() => setFilterOpen(!filterOpen)} />
    </div>
  );
}

function DeprecateFilter() {
  const { activeFilters, setActiveFilter, filterOpen } = useContext(ScopeTreeContext);
  const isActive = activeFilters.includes('deprecate');

  if (!filterOpen) return null;

  return (
    <div className={classNames(styles.deprecateFilter, isActive && styles.active)}>
      <div className={styles.filterIcon}>
        <img src="https://static.bit.dev/bit-icons/deprecated.svg" />
        <span className={styles.filterIconLabel}>Deprecated</span>
      </div>
      <div>
        <Toggle checked={isActive} onInputChanged={() => setActiveFilter('deprecate')} />
      </div>
    </div>
  );
}
