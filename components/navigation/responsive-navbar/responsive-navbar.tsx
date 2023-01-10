import React, { HTMLAttributes, useState, useRef, useEffect, ComponentType } from 'react';
import classNames from 'classnames';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import type { Position } from '@teambit/design.inputs.dropdown';
import { MenuItem } from '@teambit/design.inputs.selectors.menu-item';
import { TabLine } from './tab-line';
import type { BorderPosition } from './tab-line';
import { TabFolder } from './tab-folder';
import styles from './responsive-navbar.module.scss';

export type Tab = {
  component: ComponentType<TabProps>;
} & HTMLAttributes<HTMLDivElement>;

export type TabProps = {
  /**
   * to indicate when a tab is collapsed to the dropdown.
   */
  isInMenu: boolean;
} & HTMLAttributes<HTMLElement>;

export type ResponsiveNavbarProps = {
  /**
   * The tab that should be open on initial render.
   */
  defaultActiveIndex?: number;
  /**
   * A className to pass to nav container.
   */
  navClassName?: string;
  /**
   * A className to pass to the moving tab.
   */
  tabClassName?: string;
  /**
   * A className to pass to the secondary nav, i.e dropdown
   */
  secondaryNavClassName?: string;
  /**
   * Tab line border position can be top or bottom.
   */
  borderPosition?: BorderPosition;
  /**
   * An array of contents to render tab title and their content.
   */
  tabs: Tab[];
  dropdownPosition?: Position;
  onSelect?: (activeIndex: number) => void;
  /**
   * Styling options.
   */
  priority?: 'line' | 'folder' | 'none';
} & HTMLAttributes<HTMLDivElement>;

export function ResponsiveNavbar({
  defaultActiveIndex = 0,
  onSelect,
  navClassName,
  tabClassName,
  secondaryNavClassName,
  borderPosition = 'bottom',
  tabs,
  dropdownPosition = 'bottom-end',
  priority,
  ...rest
}: ResponsiveNavbarProps) {
  const [tabIndex, setTabIndex] = useState(defaultActiveIndex);
  const [selectedTab, setSelectedTab] = useState<HTMLElement | undefined>(undefined);
  const moreBtnRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabLineRef = useRef<HTMLDivElement>(null);
  const primaryTabRefs = useRef<HTMLDivElement[]>([]);
  const secondaryTabRefs = useRef<HTMLDivElement[]>([]);

  const getAllWidthBefore = (currentElIndex: number) => {
    let width = 0;
    primaryTabRefs.current.forEach((el, index) => {
      if (index <= currentElIndex) {
        width += el.offsetWidth;
      }
    });
    return width;
  };

  const resetStyle = () => {
    containerRef.current?.classList.remove(styles.overflow);
    moreBtnRef.current?.classList.remove(styles.hidden);
    tabLineRef.current?.classList.remove(styles.hidden);
    primaryTabRefs.current.forEach((contentTabRef) => {
      contentTabRef.classList.remove(styles.hidden);
    });
    secondaryTabRefs.current.forEach((contentTabRef) => {
      contentTabRef.classList.remove(styles.hidden);
    });
  };

  const toggleTabs = () => {
    resetStyle();
    const containerRefWidth = containerRef.current?.offsetWidth || 0;
    const buttonWidth = moreBtnRef.current?.offsetWidth || 0;
    const hiddenItems: number[] = [];

    for (let index = primaryTabRefs.current.length - 1; index > 0; index -= 1) {
      const tabRef = primaryTabRefs.current[index];
      const allWidthBefore = getAllWidthBefore(index);
      if (containerRefWidth - buttonWidth <= allWidthBefore + buttonWidth) {
        if (tabRef === selectedTab) {
          tabLineRef.current?.classList.add(styles.hidden);
        }
        tabRef.classList.add(styles.hidden);
        hiddenItems.push(index);
      }
    }

    if (!hiddenItems.length) {
      moreBtnRef.current?.classList.add(styles.hidden);
    } else {
      secondaryTabRefs.current.forEach((tabRef, index) => {
        if (!hiddenItems.includes(index)) {
          tabRef.classList.add(styles.hidden);
        }
      });
    }
  };
  useEffect(() => {
    setSelectedTab(primaryTabRefs.current[tabIndex]);
    toggleTabs();
    window.addEventListener('resize', toggleTabs);
    return () => window.removeEventListener('resize', toggleTabs);
  }, [tabIndex, selectedTab, tabs]);

  const onTabSelect = (index: number) => {
    onSelect && onSelect(index);
    setTabIndex(index);
  };

  useEffect(() => {
    setTabIndex(defaultActiveIndex);
  }, [defaultActiveIndex]);

  const getTabStyle = () => {
    switch (priority) {
      case 'none':
        return null;
      case 'line':
        return (
          <TabLine
            borderPosition={borderPosition}
            selectedTab={selectedTab}
            className={tabClassName}
            ref={tabLineRef}
          />
        );
      case 'folder':
        return <TabFolder selectedTab={selectedTab} className={tabClassName} ref={tabLineRef} />;
      default:
        return (
          <TabLine
            borderPosition={borderPosition}
            selectedTab={selectedTab}
            className={tabClassName}
            ref={tabLineRef}
          />
        );
    }
  };

  return (
    <nav {...rest} className={classNames(styles.navTabs, styles.overflow, navClassName)} ref={containerRef}>
      {tabs.map((tab, index) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { component, ...tabRest } = tab;

        return (
          <div
            {...tabRest}
            className={classNames(styles.tab, index === tabIndex && styles.active, tab.className)}
            data-priority={priority}
            onClick={() => onTabSelect(index)}
            key={`tab-${index}`}
            ref={(ref) => ref && (primaryTabRefs.current[index] = ref)}
          >
            <tab.component isInMenu={false} />
          </div>
        );
      })}
      {getTabStyle()}
      <div className={classNames(styles.more, styles.hidden)} ref={moreBtnRef}>
        <Dropdown
          placeholderContent={
            <div className={styles.dots} data-priority="menu">
              <img src="https://static.bit.dev/bit-icons/more-h.svg" />
            </div>
          }
          dropClass={classNames(styles.secondaryTabContainer, secondaryNavClassName)}
          position={dropdownPosition}
          clickToggles
          margin={8}
        >
          {tabs.map((tab, index) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { component, ...tabRest } = tab;

            return (
              <div
                {...tabRest}
                key={`dropdown-${index}`}
                ref={(ref) => ref && (secondaryTabRefs.current[index] = ref)}
                className={classNames(styles.item, tab.className)}
              >
                <MenuItem
                  className={classNames(styles.menuItem)}
                  active={index === tabIndex}
                  onClick={() => onTabSelect(index)}
                >
                  <tab.component isInMenu={true} />
                </MenuItem>
              </div>
            );
          })}
        </Dropdown>
      </div>
    </nav>
  );
}
