import React from 'react';
import classNames from 'classnames';
import {
  Tabs,
  Tab as BaseTab,
  TabProps as BaseTabProps,
  TabList as BaseTabList,
  TabListProps as BaseTabListProps,
  TabPanel as TabPanelBase,
} from 'react-tabs';

import { clickable } from '../../../to-eject/css-components/clickable';
import styles from './tabs.module.scss';

export type TabContainerProps = Tabs;
export const TabContainer = Tabs;
// TabContainer.tabsRole = TabPanel

export type TabProps = BaseTabProps;

export type TabListProps = BaseTabListProps;
export function TabList(props: TabListProps) {
  return (
    // @ts-ignore @TODO "Types of property 'ref' are incompatible"
    <BaseTabList {...props} className={classNames(styles.tabContainer, props.className)} />
  );
}
TabList.tabsRole = 'TabList';

export const TabPanel = TabPanelBase;
export function Tab(props: BaseTabProps) {
  return (
    // @ts-ignore @TODO "Types of property 'ref' are incompatible"
    <BaseTab
      {...props}
      className={classNames(props.className, clickable, styles.tab)}
      selectedClassName={styles.active}
      disabledClassName={styles.disabled}
    />
  );
}
Tab.tabsRole = 'Tab';
