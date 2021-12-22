import React from 'react';

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
} & ExpandableTabContentProps;

export function Install({ componentName, copyString, registryName, packageManager, config, ...rest }: InstallProps) {
  return (
    <ExpandableTabContent
      {...rest}
      content={
        <>
          <div>{`Install ${componentName} with ${packageManager}`}</div>
          <TooltipCopybox content={copyString} />
        </>
      }
      drawerTitle={
        <div className={styles.bottom}>
          <Icon of="settings" />
          <span>
            Configure <HighlightedText>{registryName}</HighlightedText> as a Scoped Registry
          </span>
        </div>
      }
      drawerContent={<Registry copyString={config} />}
    />
  );
}
