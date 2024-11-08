import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import { ExpandableTabContent, ExpandableTabContentProps } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { TooltipCopybox } from './tooltip-copybox';
import { Registry } from './registry';
import styles from './menu.module.scss';

export type InstallProps = {
  componentName: string;
  config: string;
  copyString: string;
  registryName: string;
  packageManager: string;
  isInstallable?: boolean;
} & ExpandableTabContentProps;

export function Install({
  componentName,
  copyString,
  registryName,
  packageManager,
  config,
  isInstallable,
  ...rest
}: InstallProps) {
  return (
    <ExpandableTabContent
      {...rest}
      content={
        <>
          <div className={classNames(!isInstallable && styles.disabled)}>
            {!isInstallable && <Icon className={styles.warnIcon} of="warn-circle" />}
            {isInstallable && `Install ${componentName} with ${packageManager}`}
            {!isInstallable && 'Installation unavailable: This component has not been built yet'}
          </div>
          {isInstallable && <TooltipCopybox content={copyString} disabled={!isInstallable} />}
        </>
      }
      drawerTitle={
        registryName && (
          <div className={styles.bottom}>
            <Icon of="settings" />
            <span>
              Configure <HighlightedText>{registryName}</HighlightedText> as Scoped Registry
            </span>
          </div>
        )
      }
      drawerContent={registryName && <Registry copyString={config} />}
    />
  );
}
