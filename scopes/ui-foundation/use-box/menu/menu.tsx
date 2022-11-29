import React, { useState, useMemo, ReactNode } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import orderBy from 'lodash.orderby';
import flatten from 'lodash.flatten';
import { Tab } from '@teambit/ui-foundation.ui.use-box.tab';

import styles from './menu.module.scss';

export type ConsumeMethod = {
  Title?: ReactNode;
  Component?: ReactNode;
  order?: number;
};

export type MenuProps = {
  /**
   * consume methods to be displayed in the menu.
   */
  methods: ConsumeMethod[];

  /**
   * component name to be presented
   */
  componentName: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Menu({ methods, componentName, ...rest }: MenuProps) {
  const [activeTab, setActiveTab] = useState(0);
  const OrderedMethods = useMemo(() => {
    return orderBy(flatten(methods), ['order']);
  }, [methods]);

  const { Component } = OrderedMethods[activeTab] || {};

  return (
    <div {...rest}>
      <div className={styles.top}>
        <div className={styles.title}>
          <Icon of="terminal" />
          <span>{`Use ${componentName}`}</span>
        </div>
      </div>
      <div className={styles.tabs}>
        {OrderedMethods.map(({ Title }, index) => {
          return (
            <Tab key={index} isActive={activeTab === index} onClick={() => setActiveTab(index)}>
              {Title}
            </Tab>
          );
        })}
      </div>

      {Component}
    </div>
  );
}
