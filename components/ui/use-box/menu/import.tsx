import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import { ExpandableTabContent, ExpandableTabContentProps } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { BitInfo } from '@teambit/ui-foundation.ui.use-box.bit-info';
import { TooltipCopybox } from './tooltip-copybox';
import styles from './menu.module.scss';

export type ImportProps = {
  /**
   * component id
   */
  componentId?: string;
  /**
   * component package name
   */
  packageName: string;
  /**
   * component display name
   */
  componentName: string;
  /**
   * showInstall flag
   */
  showInstallMethod?: boolean;
} & ExpandableTabContentProps;

export function Import({ packageName, componentName, showInstallMethod = true, ...rest }: ImportProps) {
  return (
    <ExpandableTabContent
      {...rest}
      content={
        <div className={styles.importContent}>
          <>
            <div className={classNames(!showInstallMethod && styles.disabled)}>
              {!showInstallMethod && <Icon className={styles.warnIcon} of="warn-circle" />}
              {showInstallMethod && `Add ${componentName} as a dependency`}
              {!showInstallMethod && 'Installation unavailable: This component has not been built yet'}
            </div>
            {showInstallMethod && (
              <TooltipCopybox content={`bit install ${packageName ?? ''}`} disabled={!showInstallMethod} />
            )}
          </>
          <div>{`Import ${componentName} to your workspace`}</div>
          <TooltipCopybox content={`bit import ${packageName}`} />
          <div>{`Fork ${componentName} to your workspace`}</div>
          <TooltipCopybox content={`bit fork ${packageName}`} />
        </div>
      }
      drawerTitle={
        <div className={styles.bottom}>
          <Icon color="yellow" of="download" />
          <span>Install Bit on your computer</span>
        </div>
      }
      drawerContent={<BitInfo />}
    />
  );
}
