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
  ComponentFilterCriteria,
  ComponentFilters,
  ComponentFiltersProvider,
  ComponentFiltersSlot,
  ComponentFilterContext,
} from '@teambit/component.ui.component-filters';
import {
  ComponentFilterWidgetProvider,
  ComponentTreeContext,
  ComponentTreeProvider,
  DrawerWidgetSlot,
  ComponentFilterWidgetContext,
} from './component-drawer.context';

import styles from './component-drawer.module.scss';

export type ComponentsDrawerProps = DrawerType & {
  useComponents: () => { components: ComponentModel[]; loading?: boolean };
  emptyMessage?: ReactNode;
  plugins?: ComponentsDrawerPlugins;
};

export type ComponentsDrawerPlugins = {
  treeNode?: {
    customRenderer: (treeNodeSlot?: ComponentTreeSlot) => TreeNodeRenderer<PayloadType>;
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
  }

  /**
   *
   * Compose Component Drawer Context from
   *  1. Component Tree Widget Context
   *  2. Component Tree Filter Widget Context
   *  3. Component Filters Context
   *  4. Drawer Components Context
   */

  Context = ({ children }) => {
    const filters = flatten(this.plugins?.filters?.values() || []);
    const combinedContexts = [
      ComponentTreeProvider,
      ComponentFilterWidgetProvider,
      [ComponentFiltersProvider, { filters }] as ComponentTuple<{ filters: ComponentFilters }>,
    ];
    return <Composer components={combinedContexts}>{children}</Composer>;
  };

  filtersToRender = () => {
    const { filters: filterPlugins } = this.plugins;
    if (!filterPlugins) return null;

    const filtersWithKey: (ComponentFilterCriteria<any> & { key: string })[] = useMemo(
      () =>
        flatten(
          filterPlugins.toArray().map(([key, filtersByKey]) => {
            return filtersByKey.map((filter) => ({ ...filter, key }));
          })
        ).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      [filterPlugins]
    );

    return filtersWithKey;
  };

  treeToRender = ({ visibleComponents, collapsed }) => {
    const { treeNode } = this.plugins;
    const TreeNode =
      treeNode?.customRenderer && useCallback(treeNode.customRenderer(treeNode.widgets), [treeNode.widgets]);
    return (
      <ComponentTree
        components={visibleComponents}
        isCollapsed={collapsed}
        className={styles.componentTree}
        TreeNode={TreeNode}
      />
    );
  };

  render = () => {
    const { loading, components } = this.useComponents();
    const { collapsed } = useContext(ComponentTreeContext);
    const { filterWidgetOpen } = useContext(ComponentFilterWidgetContext);
    const { filters } = useContext(ComponentFilterContext);
    const { drawerWidgets, treeNode } = this.plugins;

    if (loading) return <FullLoader />;

    const filtersToRender = this.filtersToRender();
    const treeToRender = this.treeToRender();

    const allComponentModels = components.map((component) => component.model);

    const filteredComponents = useMemo(() => matches(filters, allComponentModels), [filters]);

    const visibleComponents = components.filter((component) => !component.isHidden).map((component) => component.model);

    const isVisible = visibleComponents.length > 0;

    const emptyDrawer = (
      <span className={classNames(mutedItalic, ellipsis, styles.emptyDrawer)}>{this.emptyMessage}</span>
    );

    return (
      <div key={this.id} className={styles.drawerContainer}>
        <div className={classNames(styles.filtersContainer, filterWidgetOpen && styles.open)}>{filtersToRender}</div>
        {isVisible && (
          <ComponentTree
            components={visibleComponents}
            isCollapsed={collapsed}
            TreeNode={TreeNode}
            className={styles.componentTree}
          />
        )}
        {isVisible || emptyDrawer}
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
    <div className={styles.widgetIcon}>
      <img src={icon} onClick={() => setCollapsed(!collapsed)} />
    </div>
  );
}

export function FilterWidget() {
  const { filterWidgetOpen, setFilterWidget } = useContext(ComponentFilterWidgetContext);
  return (
    <div className={classNames(styles.widgetIcon, styles.filterWidget)}>
      <img src="https://static.bit.dev/bit-icons/filter.svg" onClick={() => setFilterWidget(!filterWidgetOpen)} />
    </div>
  );
}
