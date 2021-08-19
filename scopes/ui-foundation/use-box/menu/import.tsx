import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TabContent, TabContentProps } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import { TooltipCopybox } from './tooltip-copybox';
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

export function Import({ componentId, packageName, componentName = '', back, ...rest }: ImportProps) {
  return (
    <TabContent
      {...rest}
      bottom={
        <div className={linkStyles} onClick={back}>
          <Icon of="download" />
          <span>Install Bit on your computer</span>
        </div>
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
