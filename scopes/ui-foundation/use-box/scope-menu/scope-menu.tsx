import React, { useState } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
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
  const [active, setActive] = useState<string | undefined>(undefined);
  if (active === 'import') {
    return <BitInfo prevTab={active} setActive={() => setActive(undefined)} />;
  }

  return (
    <div {...rest}>
      <div className={styles.top}>
        <div className={styles.title}>
          <Icon of="terminal" />
          <Ellipsis>{`Bulk use components from ${scopeName}`}</Ellipsis>
        </div>
      </div>
      <TabContent
        bottom={
          <div className={linkStyles} onClick={() => setActive('import')}>
            <Icon of="download" />
            <span>Install Bit on your computer</span>
          </div>
        }
      >
        <div className={styles.importContent}>
          <div>Use glob-patterns to import many components </div>
          <CopyBox>{`bit import "${scopeName}/*"`}</CopyBox>
        </div>
      </TabContent>
    </div>
  );
}
