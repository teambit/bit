import React, { useState } from 'react';
import classNames from 'classnames';
import AnimateHeight from 'react-animate-height';
import { Icon } from '@teambit/evangelist.elements.icon';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import { TabContent, TabContentProps } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import { TooltipCopybox } from './tooltip-copybox';
import { Registry } from './registry';
import styles from './menu.module.scss';

export type InstallProps = {
  componentName: string;
  copyString: string;
  registryName: string;
  packageManager: string;
} & TabContentProps;

export function Install({ componentName, copyString, registryName, packageManager, ...rest }: InstallProps) {
  const [open, toggle] = useState(false);
  return (
    <TabContent
      {...rest}
      bottom={
        <>
          <div className={classNames(linkStyles, styles.drawer)} onClick={() => toggle(!open)}>
            <div>
              <Icon of="settings" />
              <span>
                Configure <HighlightedText>{registryName}</HighlightedText> as a Scoped Registry
              </span>
            </div>
            <Icon of="down-rounded-corners" className={open && styles.open} />
          </div>
          <AnimateHeight height={open ? 'auto' : 0}>
            <Registry registryName={registryName} copyString={copyString} />
          </AnimateHeight>
        </>
      }
    >
      <div>{`Install ${componentName} with ${packageManager}`}</div>
      <TooltipCopybox content={copyString} />
    </TabContent>
  );
}
