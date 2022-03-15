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
} from '@teambit/component-filters';
import {
  ComponentFilterWidgetProvider,
  ComponentTreeContext,
  ComponentTreeProvider,
  DrawerComponentsProvider,
  DrawerWidgetSlot,
  DrawerComponentsContext,
  ComponentFilterWidgetContext,
} from './component-drawer.context';

import styles from './component-drawer.module.scss';

export type ComponentsDrawerProps = {
  id: string;
  name: string;
  getDrawerComponents: () => { components: ComponentModel[]; loading?: boolean };
  filtersSlot?: ComponentFiltersSlot;
  drawerWidgetSlot?: DrawerWidgetSlot;
  treeNodeSlot?: ComponentTreeSlot;
  tooltip?: string;
  order?: number;
  isHidden?: () => boolean;
  emptyDrawerMessage?: ReactNode;
  customTreeNodeRenderer?: (treeNodeSlot?: ComponentTreeSlot) => TreeNodeRenderer<PayloadType>;
};

export class ComponentsDrawer implements DrawerType {
  readonly id: string;
  readonly name: string;
  readonly getDrawerComponents: () => { components: ComponentModel[]; loading?: boolean };
  readonly tooltip?: string;
  readonly order?: number;
  readonly isHidden?: () => boolean;
  readonly widgets: ReactNode[];
  readonly treeNodeSlot?: ComponentTreeSlot;
  readonly filtersSlot?: ComponentFiltersSlot;
  readonly customTreeNodeRenderer?: (treeNodeSlot?: ComponentTreeSlot) => TreeNodeRenderer<PayloadType>;
  readonly emptyDrawerMessage?: ReactNode;

  constructor(props: ComponentsDrawerProps) {
    this.id = props.id;
    this.name = props.name;
    this.tooltip = props.tooltip;
    this.order = props.order;
    this.isHidden = props.isHidden;
    this.widgets = (props.drawerWidgetSlot && flatten(props.drawerWidgetSlot?.values())) || [];
    this.getDrawerComponents = props.getDrawerComponents;
    this.treeNodeSlot = props.treeNodeSlot;
    this.emptyDrawerMessage = props.emptyDrawerMessage;
    this.filtersSlot = props.filtersSlot;
    this.customTreeNodeRenderer = props?.customTreeNodeRenderer;
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
    const { components, loading } = this.getDrawerComponents();
    const filters = flatten(this.filtersSlot?.values() || []);
    const combinedContexts = [
      [DrawerComponentsProvider, { components, loading }] as ComponentTuple<{
        components: ComponentModel[];
        loading: boolean;
      }>,
      ComponentTreeProvider,
      ComponentFilterWidgetProvider,
      [ComponentFiltersProvider, { filters }] as ComponentTuple<{ filters: ComponentFilters }>,
    ];
    return <Composer components={combinedContexts}>{children}</Composer>;
  };

  render = () => {
    const drawerComponentContext = useContext(DrawerComponentsContext);
    let { components } = drawerComponentContext;
    const { loading } = drawerComponentContext;
    const { collapsed } = useContext(ComponentTreeContext);
    const { filterWidgetOpen } = useContext(ComponentFilterWidgetContext);
    const { filters, matches } = useContext(ComponentFilterContext);
    const { customTreeNodeRenderer, emptyDrawerMessage, filtersSlot, id, treeNodeSlot } = this;

    if (loading) return <FullLoader />;

    const allComponentModels = components.map((component) => component.model);

    useMemo(() => {
      components = matches(filters, allComponentModels);
    }, [filters]);

    const visibleComponents = components.filter((component) => !component.isHidden).map((component) => component.model);

    const filtersWithKey: (ComponentFilterCriteria<any> & { key: string })[] = flatten(
      filtersSlot?.toArray().map(([key, filtersByKey]) => {
        return filtersByKey.map((filter) => ({ ...filter, key }));
      })
    ).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const filtersToRender = filtersWithKey.map((filter) => {
      return (
        <filter.render
          key={`${filter.key}-${filter.id}`}
          components={allComponentModels}
          className={classNames(styles.filter)}
        />
      );
    });

    const isVisible = visibleComponents.length > 0;

    const emptyDrawer = (
      <span className={classNames(mutedItalic, ellipsis, styles.emptyDrawer)}>{emptyDrawerMessage}</span>
    );

    const TreeNode = customTreeNodeRenderer && useCallback(customTreeNodeRenderer(treeNodeSlot), [treeNodeSlot]);

    return (
      <div key={id} className={styles.drawerContainer}>
        <div className={classNames(styles.filtersContainer, filterWidgetOpen && styles.open)}>{filtersToRender}</div>
        {isVisible && <ComponentTree components={visibleComponents} isCollapsed={collapsed} TreeNode={TreeNode} />}
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
