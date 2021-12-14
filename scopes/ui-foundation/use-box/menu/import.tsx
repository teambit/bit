import React, { useState } from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import AnimateHeight from 'react-animate-height';
import { TabContent, TabContentProps } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import { BitInfo } from '@teambit/ui-foundation.ui.use-box.bit-info';
import { TooltipCopybox } from './tooltip-copybox';
// import {} from './'
import styles from './menu.module.scss';

export type ImportProps = {
  /**
   * component id
   */
  componentId: string;
  /**
   * component package name
   */
  packageName: string;
  /**
   * link to info
   */
  back?: () => void;
  /**
   * component display name
   */
  componentName: string;
} & TabContentProps;

export function Import({ componentId, packageName, componentName = '', ...rest }: ImportProps) {
  const [open, toggle] = useState(false);
  return (
    <TabContent
      {...rest}
      bottom={
        <>
          <div className={classNames(styles.drawer, linkStyles)} onClick={() => toggle(!open)}>
            <div>
              <Icon of="download" />
              <span>Install Bit on your computer</span>
            </div>
            <Icon of="down-rounded-corners" className={open && styles.open} />
          </div>
          <AnimateHeight height={open ? 'auto' : 0}>
            <BitInfo />
          </AnimateHeight>
        </>
      }
    >
      <div className={styles.importContent}>
        <div>{`Add ${componentName} as a dependency`}</div>
        <TooltipCopybox content={`bit install ${packageName}`} />
        <div>{`Import ${componentName} to your workspace`}</div>
        <TooltipCopybox content={`bit import ${componentId}`} />
      </div>
    </TabContent>
  );
}
