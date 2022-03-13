import React, { useCallback, useContext, ReactNode } from 'react';
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
import styles from './components-drawer.module.scss';
import { DrawerComponentsContext } from './component-drawer.context';
import {
  ComponentFilters,
  ComponentFiltersProvider,
  ComponentFiltersSlot,
} from '../component-filters/component-filters.context';
import {
  ComponentFilterWidgetProvider,
  ComponentTreeContext,
  ComponentTreeProvider,
  DrawerComponentsProvider,
  DrawerWidgetSlot,
} from './component-drawer.context';

export type ComponentsDrawerProps = {
  id: string;
  name: string;
  getDrawerData: () => { components: ComponentModel[]; loading?: boolean };
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
  readonly getDrawerData: () => { components: ComponentModel[]; loading?: boolean };
  readonly tooltip?: string;
  readonly order?: number;
  readonly isHidden?: () => boolean;
  readonly widgets: ReactNode[];
  readonly treeNodeSlot?: ComponentTreeSlot;
  readonly filters: ComponentFilters;
  readonly customTreeNodeRenderer?: TreeNodeRenderer<PayloadType>;
  readonly emptyDrawerMessage?: ReactNode;

  constructor(props: ComponentsDrawerProps) {
    this.id = props.id;
    this.name = props.name;
    this.tooltip = props.tooltip;
    this.order = props.order;
    this.isHidden = props.isHidden;
    this.widgets = (props.drawerWidgetSlot && flatten(props.drawerWidgetSlot?.values())) || [];
    this.getDrawerData = props.getDrawerData;
    this.treeNodeSlot = props.treeNodeSlot;
    this.emptyDrawerMessage = props.emptyDrawerMessage;
    this.filters = (props.filtersSlot && flatten(props.filtersSlot.values())) || [];
    this.customTreeNodeRenderer =
      props?.customTreeNodeRenderer &&
      useCallback(props.customTreeNodeRenderer(props.treeNodeSlot), [props.treeNodeSlot]);
  }

  /**
   *
   * Compose Component Drawer Context from
   *  1. Drawer Widget Context
   *    1.1 Component Tree Widget Context
   *    1.2 Component Tree Filter Widget Context
   *  2. Component Filters Context
   *  3. Component Drawer Components Context
   */

  Context = ({ children }) => {
    const { components, loading } = this.getDrawerData();
    const combinedContexts = [
      [DrawerComponentsProvider, { components, loading }] as ComponentTuple<{
        components: ComponentModel[];
        loading: boolean;
      }>,
      ComponentTreeProvider,
      ComponentFilterWidgetProvider,
      ComponentFiltersProvider,
    ];
    return <Composer components={combinedContexts}>{children}</Composer>;
  };

  render = () => {
    const { loading, components } = useContext(DrawerComponentsContext);
    const { collapsed } = useContext(ComponentTreeContext);
    const { customTreeNodeRenderer, emptyDrawerMessage, filters } = this;

    if (loading) return <FullLoader />;

    const visibleComponents = components.filter((component) => !component.isHidden).map((component) => component.model);

    if (visibleComponents.length === 0)
      return <span className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>{emptyDrawerMessage}</span>;

    return (
      <div>
        {filters.map((filter) => (
          <filter.render components={components.map((component) => component.model)} />
        ))}
        <ComponentTree components={visibleComponents} isCollapsed={collapsed} TreeNode={customTreeNodeRenderer} />
      </div>
    );
  };
}

// function TreeToggleWidget() {
//   const { collapsed, setCollapsed } = useContext(ComponentTreeContext);
//   const icon = collapsed
//     ? 'https://static.bit.dev/bit-icons/expand.svg'
//     : 'https://static.bit.dev/bit-icons/collapse.svg';
//   return <img src={icon} className={styles.collapseIcon} onClick={() => setCollapsed(!collapsed)} />;
// }

// function FilterWidget() {
//   const { filterOpen, setFilterOpen } = useContext(ComponentTreeContext);
//   return (
//     <Icon
//       className={classNames(styles.filterWidgetIcon, filterOpen && styles.open)}
//       of="Ripple_filters"
//       onClick={() => setFilterOpen(!filterOpen)}
//     />
//   );
// }
