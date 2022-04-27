import React, { useCallback, useContext, ReactNode, useMemo } from 'react';
import classNames from 'classnames';
import { ComponentTree, PayloadType } from '@teambit/ui-foundation.ui.side-bar';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import { ComponentTreeSlot } from '@teambit/component-tree';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { ComponentModel } from '@teambit/component';
import { TreeNodeRenderer } from '@teambit/design.ui.tree';
import { Composer, ComponentTuple } from '@teambit/base-ui.utils.composer';
import flatten from 'lodash.flatten';
import {
  ComponentFiltersProvider,
  ComponentFilterContext,
  runAllFilters,
  ComponentFilters,
} from '@teambit/component.ui.component-filters';
import { SlotRegistry } from '@teambit/harmony';
import { ComponentFilterWidgetProvider, ComponentFilterWidgetContext } from './component-drawer-filter-widget.context';
import { ComponentTreeContext, ComponentTreeProvider } from './component-drawer-tree-widget.context';

import styles from './component-drawer.module.scss';

export type ComponentFiltersSlot = SlotRegistry<ComponentFilters>;
export type DrawerWidgetSlot = SlotRegistry<ReactNode[]>;

export type ComponentsDrawerProps = Omit<DrawerType, 'render'> & {
  useComponents: () => { components: ComponentModel[]; loading?: boolean };
  emptyMessage?: ReactNode;
  plugins?: ComponentsDrawerPlugins;
};

export type ComponentsDrawerPlugins = {
  tree?: {
    customRenderer?: (treeNodeSlot?: ComponentTreeSlot) => TreeNodeRenderer<PayloadType>;
    widgets: ComponentTreeSlot;
  };
  filters?: ComponentFiltersSlot;
  drawerWidgets?: DrawerWidgetSlot;
};

export class ComponentsDrawer implements DrawerType {
  readonly id: string;
  readonly useComponents: () => { components: ComponentModel[]; loading?: boolean };
  name: ReactNode;
  tooltip?: string;
  order?: number;
  isHidden?: () => boolean;
  emptyMessage?: ReactNode;
  widgets: ReactNode[];
  plugins: ComponentsDrawerPlugins;

  constructor(props: ComponentsDrawerProps) {
    Object.assign(this, props);
    this.useComponents = props.useComponents;
    this.emptyMessage = props.emptyMessage;
    this.plugins = props.plugins || {};
    this.setWidgets(props.plugins?.drawerWidgets);
  }

  Context = ({ children }) => {
    const filters = flatten(this.plugins?.filters?.values() || []);
    const combinedContexts = [
      ComponentTreeProvider,
      ComponentFilterWidgetProvider,
      [ComponentFiltersProvider, { filters }] as ComponentTuple<{ children?: ReactNode; filters: any }>,
    ];
    return <Composer components={combinedContexts}>{children}</Composer>;
  };

  renderFilters = ({ components }: { components: ComponentModel[] }) => {
    const { filterWidgetOpen } = useContext(ComponentFilterWidgetContext);
    const filterPlugins = this.plugins.filters;

    const filters = useMemo(
      () =>
        (filterPlugins &&
          flatten(
            filterPlugins.toArray().map(([key, filtersByKey]) => {
              return filtersByKey.map((filter) => ({ ...filter, key: `${key}-${filter.id}` }));
            })
          ).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) ||
        [],
      [filterPlugins]
    );

    return (
      <div className={classNames(styles.filtersContainer, filterWidgetOpen && styles.open)}>
        {filters.map((filter) => (
          <filter.render
            key={filter.key}
            components={components}
            className={classNames(styles.filter, filterWidgetOpen && styles.open)}
          />
        ))}
      </div>
    );
  };

  renderTree = ({ components }: { components: ComponentModel[] }) => {
    const { collapsed } = useContext(ComponentTreeContext);
    const { tree } = this.plugins;

    const TreeNode = tree?.customRenderer && useCallback(tree.customRenderer(tree.widgets), [tree.widgets]);
    const isVisible = components.length > 0;

    if (!isVisible) return null;

    return (
      <div className={styles.drawerTreeContainer}>
        <ComponentTree components={components} isCollapsed={collapsed} TreeNode={TreeNode} />
      </div>
    );
  };

  setWidgets = (widgets?: DrawerWidgetSlot) => {
    this.widgets = flatten(widgets?.values());
  };

  render = () => {
    const { loading, components } = this.useComponents();
    const componentFiltersContext = useContext(ComponentFilterContext);

    if (loading) return <FullLoader />;

    const filters = componentFiltersContext?.filters || [];

    const filteredComponents = useMemo(() => runAllFilters(filters, components), [filters]);

    const Filters = this.renderFilters({ components });
    const Tree = this.renderTree({ components: filteredComponents });

    const emptyDrawer = (
      <span className={classNames(mutedItalic, ellipsis, styles.emptyDrawer)}>{this.emptyMessage}</span>
    );

    return (
      <div key={this.id} className={styles.drawerContainer}>
        {Filters}
        {Tree}
        {filteredComponents.length === 0 && emptyDrawer}
      </div>
    );
  };
}

export function TreeToggleWidget() {
  const { collapsed, setCollapsed } = useContext(ComponentTreeContext);
  const icon = collapsed
    ? 'https://static.bit.dev/bit-icons/expand.svg'
    : 'https://static.bit.dev/bit-icons/collapse.svg';
  return (
    <div className={classNames(styles.widgetIcon, !collapsed && styles.open)}>
      <img src={icon} onClick={() => setCollapsed(!collapsed)} />
    </div>
  );
}

export function FilterWidget() {
  const { filterWidgetOpen, setFilterWidget } = useContext(ComponentFilterWidgetContext);
  return (
    <div className={classNames(styles.widgetIcon, styles.filterWidget, filterWidgetOpen && styles.open)}>
      <img src="https://static.bit.dev/bit-icons/filter.svg" onClick={() => setFilterWidget(!filterWidgetOpen)} />
    </div>
  );
}
