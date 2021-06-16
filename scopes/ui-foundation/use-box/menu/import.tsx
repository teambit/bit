import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { TabContent, TabContentProps } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
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
        <CopyBox>{`bit install ${packageName}`}</CopyBox>
        <div>{`Import ${componentName} to your workspace`}</div>
        <CopyBox>{`bit import ${componentId}`}</CopyBox>
      </div>
    </TabContent>
  );
}
