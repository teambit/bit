import React, { useMemo } from 'react';
import classnames from 'classnames';
import { findLastIndex } from 'lodash';
import { ResponsiveNavbar } from '@teambit/design.navigation.responsive-navbar';
import type { TabProps } from '@teambit/design.navigation.responsive-navbar';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import { MenuItem } from '@teambit/design.inputs.selectors.menu-item';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { TopBarNav } from '../top-bar-nav';
import styles from './menu.module.scss';
import type { NavPlugin, OrderedNavigationSlot } from './nav-plugin';

export type MenuNavProps = {
  /**
   * @deprecated
   * use @property navPlugins
   */
  navigationSlot?: OrderedNavigationSlot;
  /**
   * @deprecated
   * use @property widgetPlugins
   */
  widgetSlot?: OrderedNavigationSlot;
  navPlugins?: [string, NavPlugin][];
  widgetPlugins?: [string, NavPlugin][];
  /**
   * A className to pass to the secondary nav, i.e dropdown
   */
  secondaryNavClassName?: string;
  activeTabIndex?: number;
  alwaysShowActiveTab?: boolean;
} & React.HTMLAttributes<HTMLElement>;

function TopBarNavComponent({ isInMenu, menuItemProps }: TabProps) {
  /**
   * to accommodate for the top level nav which should display the children
   * in the dropdown secondary menu if there is a displayName set
   */
  const widgetDisplayText = menuItemProps?.displayName && isInMenu ? menuItemProps?.displayName : undefined;
  return (
    <TopBarNav
      {...menuItemProps}
      className={classnames(menuItemProps?.className, styles.topBarNav, isInMenu && styles.noBorder)}
    >
      {widgetDisplayText || menuItemProps?.children}
    </TopBarNav>
  );
}

export function CollapsibleMenuNav({
  navigationSlot,
  widgetSlot,
  navPlugins = [],
  widgetPlugins = [],
  className,
  secondaryNavClassName,
  activeTabIndex,
  alwaysShowActiveTab,
  children,
}: MenuNavProps) {
  const { isMinimal } = useWorkspaceMode();
  const plugins = useMemo(() => {
    const _navPlugins = navPlugins.length > 0 ? navPlugins : navigationSlot?.toArray();
    if (!isMinimal) {
      return (_navPlugins || []).sort(sortFn);
    }
    return (_navPlugins || []).filter((widget) => !widget[1].props.hideInMinimalMode).sort(sortFn);
  }, [navigationSlot, navPlugins, isMinimal]);

  const widgets = useMemo(() => {
    const _widgetPlugins = widgetPlugins.length > 0 ? widgetPlugins : widgetSlot?.toArray();
    if (!isMinimal) {
      return (_widgetPlugins || []).sort(sortFn);
    }
    return (_widgetPlugins || []).filter((widget) => !widget[1].props.hideInMinimalMode).sort(sortFn);
  }, [widgetSlot, widgetPlugins, isMinimal]);

  // in minimal mode, tabs up to (and including) the last primary tab render outside the
  // ResponsiveNavbar, which would otherwise collapse any tab but the first when space runs out.
  const fixedCount = isMinimal ? findLastIndex(plugins, ([, { props }]) => !!props.primaryInMinimalMode) + 1 : 0;
  const fixedPlugins = plugins.slice(0, fixedCount);
  const collapsiblePlugins = plugins.slice(fixedCount);

  const links = [...collapsiblePlugins, ...widgets].map(([, menuItem], index) => {
    // these styles keep plugins to the left and widgets to the right.
    const lastPluginStyle = collapsiblePlugins.length - 1 === index ? { marginRight: 'auto' } : {};

    const firstWidgetStyle = collapsiblePlugins.length === index ? { marginLeft: 'auto' } : {};

    return {
      component: TopBarNavComponent,
      tabProps: {
        menuItemProps: menuItem.props,
      },
      style: { ...firstWidgetStyle, ...lastPluginStyle },
      className: menuItem.props.className,
    };
  });

  return (
    <>
      {isMinimal && (
        <MinimalMenuNav navItems={[...plugins, ...widgets]} secondaryNavClassName={secondaryNavClassName} />
      )}
      {fixedPlugins.length > 0 && (
        <div className={styles.minimalFixedNav}>
          {fixedPlugins.map(([, { props }], index) => (
            <TopBarNavComponent key={`minimal-fixed-${index}`} menuItemProps={props} isInMenu={false} />
          ))}
        </div>
      )}
      <ResponsiveNavbar
        navClassName={classnames(styles.tab, isMinimal && styles.hideMinimalMobileNav, className)}
        secondaryNavClassName={secondaryNavClassName}
        style={{ width: '100%', height: '100%' }}
        priority="none"
        tabs={links}
        defaultActiveIndex={activeTabIndex}
        alwaysShowActiveTab={alwaysShowActiveTab}
      >
        {children}
      </ResponsiveNavbar>
    </>
  );
}

function MinimalMenuNav({
  navItems,
  secondaryNavClassName,
}: {
  navItems: [string, NavPlugin][];
  secondaryNavClassName?: string;
}) {
  if (navItems.length === 0) return null;

  // primary tabs (e.g. Preview) stay pinned on mobile, right after the More menu that holds the
  // rest (Overview first); they render their compact `minimalMobileChildren` (an icon) when given.
  const primaryItems = navItems.filter(([, { props }]) => props.primaryInMinimalMode);
  const moreItems = navItems.filter(([, { props }]) => !props.primaryInMinimalMode);

  return (
    <div className={styles.minimalMoreNav}>
      {moreItems.length > 0 && (
        <Dropdown
          placeholderContent={
            <div className={styles.minimalMoreButton} aria-label="More component sections">
              <img src="https://static.bit.dev/bit-icons/more-h.svg" alt="" />
            </div>
          }
          dropClass={secondaryNavClassName}
          position="bottom-end"
          placeholderBorder={false}
          clickToggles
          margin={8}
        >
          {moreItems.map(([, { props }], index) => (
            <MenuItem className={styles.minimalMenuItem} key={`minimal-dropdown-${index}`}>
              <TopBarNavComponent menuItemProps={props} isInMenu />
            </MenuItem>
          ))}
        </Dropdown>
      )}
      {primaryItems.map(([, { props }], index) => (
        <TopBarNavComponent
          key={`minimal-primary-${index}`}
          menuItemProps={{
            ...props,
            children: props.minimalMobileChildren ?? props.children,
            className: classnames(props.className, styles.minimalPrimaryTab),
          }}
          isInMenu={false}
        />
      ))}
    </div>
  );
}

function sortFn([, { order: first }]: [string, NavPlugin], [, { order: second }]: [string, NavPlugin]) {
  return (first ?? 0) - (second ?? 0);
}
