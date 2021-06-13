import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { TabContent } from '../tab-content/tab-content';
import { linkStyles } from '../bottom-link';
import styles from './menu.module.scss';

export type ImportProps = {
  // componentName: string;
  componentId: string;
  packageName: string;
  back?: () => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function Import({
  // componentName,
  componentId,
  packageName,
  back,
  ...rest
}: ImportProps) {
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
        <div>Add heading as a dependency</div>
        <CopyBox>{`bit install ${packageName}`}</CopyBox>
        <div>Import heading to your workspace</div>
        <CopyBox>{`bit import ${componentId}`}</CopyBox>
      </div>
    </TabContent>
  );
}
