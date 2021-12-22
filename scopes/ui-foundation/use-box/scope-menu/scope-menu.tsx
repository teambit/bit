import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { ExpandableTabContent } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { BitInfo } from '@teambit/ui-foundation.ui.use-box.bit-info';
import styles from './scope-menu.module.scss';

export type MenuProps = {
  /**
   * scope name to be presented
   */
  scopeName: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Menu({ scopeName, ...rest }: MenuProps) {
  return (
    <div {...rest}>
      <div className={styles.top}>
        <div className={styles.title}>
          <Icon of="terminal" />
          <Ellipsis>{`Bulk import from ${scopeName}`}</Ellipsis>
        </div>
      </div>
      <ExpandableTabContent
        content={
          <div className={styles.importContent}>
            <div>Use a glob-pattern to import multiple components</div>
            <CopyBox>{`bit import "${scopeName}/*"`}</CopyBox>
          </div>
        }
        drawerTitle={
          <div className={styles.drawerTitle}>
            <Icon of="download" />
            <span>Install Bit on your computer</span>
          </div>
        }
        drawerContent={<BitInfo />}
      />
    </div>
  );
}
