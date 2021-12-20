import React, { useState, useMemo, ReactNode } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Tab } from '@teambit/ui-foundation.ui.use-box.tab';

import styles from './menu.module.scss';

// TODO where should we place this type? its being created in component ui runtime as well
export type ConsumeMethod = {
  Title?: ReactNode;
  Component?: ReactNode;
  order?: number;
};

export type ConsumeMethodsMenuProps = {
  /**
   * consume methods
   */
  methods: ConsumeMethod[];

  /**
   * component name to be presented
   */
  componentName: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function ConsumeMethodsMenu({ methods, componentName, ...rest }: ConsumeMethodsMenuProps) {
  const [activeTab, setActiveTab] = useState(0);
  const content = useMemo(
    () =>
      methods.flat().sort((a, b) => {
        if (a.order === undefined) return 1;
        if (b.order === undefined) return -1;
        return a.order - b.order;
      }),
    [methods]
  );

  const { Component } = content[activeTab];

  return (
    <div {...rest}>
      <div className={styles.top}>
        <div className={styles.title}>
          <Icon of="terminal" />
          <span>{`Use ${componentName}`}</span>
        </div>
      </div>
      <div className={styles.tabs}>
        {content.map(({ Title, Component: comp }, index) => {
          if (!Title || !comp) return null;
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
