import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { TabContent } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import styles from './menu.module.scss';

export type InstallProps = {
  componentName: string;
  copyString: string;
  back: () => void;
  registryName: string;
  packageManager: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Install({ componentName, copyString, back, registryName, packageManager, ...rest }: InstallProps) {
  return (
    <TabContent
      {...rest}
      bottom={
        <div className={classNames(linkStyles, styles.installLink)} onClick={back}>
          <div>
            <Icon of="settings" />
            <span>
              Configure <HighlightedText size="xxs">{registryName}</HighlightedText> as a Scoped Registry
            </span>
          </div>
          <Icon of="arrow_right" />
        </div>
      }
    >
      <div>{`Install ${componentName} with a ${packageManager}`}</div>
      <CopyBox>{copyString}</CopyBox>
    </TabContent>
  );
}
