import React, { useState } from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import AnimateHeight from 'react-animate-height';
import { TabContent } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { BitInfo } from '@teambit/ui-foundation.ui.use-box.bit-info';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import styles from './scope-menu.module.scss';

export type MenuProps = {
  /**
   * scope name to be presented
   */
  scopeName: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Menu({ scopeName, ...rest }: MenuProps) {
  const [open, toggle] = useState(false);

  return (
    <div {...rest}>
      <div className={styles.top}>
        <div className={styles.title}>
          <Icon of="terminal" />
          <Ellipsis>{`Bulk import from ${scopeName}`}</Ellipsis>
        </div>
      </div>
      <TabContent
        bottom={
          <>
            <div className={classNames(linkStyles, styles.drawer)} onClick={() => toggle(!open)}>
              <div>
                <Icon of="download" />
                <span>Install Bit on your computer</span>
              </div>
              <Icon of="down-rounded-corners" className={open && styles.open} />
            </div>
            <AnimateHeight height={open ? 'auto' : 0}>
              <BitInfo />
            </AnimateHeight>
          </>
        }
      >
        <div className={styles.importContent}>
          <div>Use a glob-pattern to import multiple components</div>
          <CopyBox>{`bit import "${scopeName}/*"`}</CopyBox>
        </div>
      </TabContent>
    </div>
  );
}
