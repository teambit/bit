import React, { useState, ComponentType, ReactNode } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Tab } from '@teambit/ui-foundation.ui.use-box.tab';

import styles from './menu.module.scss';

export type ConsumeMethod = {
  Title: ReactNode;
  Component: ReactNode;
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

export function ConsumeMethodsMenu({
  methods,

  componentName,
  // elementsUrl,
  ...rest
}: ConsumeMethodsMenuProps) {
  const [activeTab, setActiveTab] = useState(0);
  const content = methods.flat();
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
        {content.map(({ Title }, index) => {
          if (!Title) return null;
          return (
            <Tab key={index} isActive={activeTab === index} onClick={() => setActiveTab(index)}>
              {Title}
            </Tab>
          );
        })}
      </div>

      {Component}

      {/* {activeTab === 'elements' && elementsUrl && <Elements componentName={componentName} url={elementsUrl} />} */}
    </div>
  );
}
