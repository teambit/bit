import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { ConsumeMethodTemplate, ConsumeMethodTemplateProps } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { BitInfo } from '@teambit/ui-foundation.ui.use-box.bit-info';
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
   * component display name
   */
  componentName: string;
} & ConsumeMethodTemplateProps;

export function Import({ componentId, packageName, componentName, ...rest }: ImportProps) {
  return (
    <ConsumeMethodTemplate
      {...rest}
      content={
        <div className={styles.importContent}>
          <div>{`Add ${componentName} as a dependency`}</div>
          <TooltipCopybox content={`bit install ${packageName}`} />
          <div>{`Import ${componentName} to your workspace`}</div>
          <TooltipCopybox content={`bit import ${componentId}`} />
        </div>
      }
      drawerTitle={
        <div className={styles.bottom}>
          <Icon of="download" />
          <span>Install Bit on your computer</span>
        </div>
      }
      drawerContent={<BitInfo />}
    />
  );
}
