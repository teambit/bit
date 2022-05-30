import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { links } from '@teambit/documenter.content.documentation-links';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { TabContent, TabContentProps } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import { Link } from '@teambit/base-react.navigation.link';
import styles from './menu.module.scss';

export type RegistryProps = {
  copyString: string;
} & TabContentProps;

export function Registry({ copyString, ...rest }: RegistryProps) {
  return (
    <TabContent
      {...rest}
      className={styles.registry}
      bottom={
        <Link external href={links.scopedRegistry} className={linkStyles}>
          <Icon of="information-sign" />
          <span>Learn more</span>
        </Link>
      }
    >
      <CopyBox>{copyString}</CopyBox>
    </TabContent>
  );
}
