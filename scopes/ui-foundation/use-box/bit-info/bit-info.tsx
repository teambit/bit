import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { links } from '@teambit/documenter.content.documentation-links';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { TabContent } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { Link } from '@teambit/base-react.navigation.link';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import styles from './bit-info.module.scss';

export type BitInfoProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function BitInfo({ ...rest }: BitInfoProps) {
  return (
    <div {...rest}>
      <TabContent
        className={styles.moreInfo}
        bottom={
          <Link external href={links.installBit} className={linkStyles}>
            <Icon of="information-sign" />
            <span>Learn more</span>
          </Link>
        }
      >
        <div>Install bit version manager</div>
        <CopyBox>npm i -g @teambit/bvm</CopyBox>
        <div>Install bit</div>
        <CopyBox>bvm install</CopyBox>
      </TabContent>
    </div>
  );
}
