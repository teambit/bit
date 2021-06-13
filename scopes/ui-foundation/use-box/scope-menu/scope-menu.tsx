import React, { useState } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { BitInfo, TabContent } from '../tab-content';
import styles from './scope-menu.module.scss';

// export type TabOptions = "registry" | "import" | "install";

export type MenuProps = {
  /**
   * scope name to be presented
   */
  scopeName: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Menu({ scopeName }: MenuProps) {
  const [active, setActive] = useState<string | undefined>(undefined);
  if (active === 'import') {
    return <BitInfo prevTab={active} setActive={() => setActive(undefined)} />;
  }

  return (
    <div>
      <div className={styles.top}>
        <div className={styles.title}>
          <Icon of="terminal" />
          <span>{`Bulk use components from ${scopeName}`}</span>
        </div>
      </div>
      <TabContent
        bottom={
          <div className={styles.link} onClick={() => setActive('import')}>
            <Icon of="download" />
            <span>Install Bit on your computer</span>
          </div>
        }
      >
        <div className={styles.importContent}>
          <div>Use glob-patterns to import many components </div>
          <CopyBox>{`bit import ${scopeName}/*`}</CopyBox>
        </div>
      </TabContent>
    </div>
  );
}
