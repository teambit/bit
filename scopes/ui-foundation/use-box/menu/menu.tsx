import React, { useState } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { BitInfo } from '@teambit/ui-foundation.ui.use-box.bit-info';
import { Registry } from './registry';
import { Install } from './install';
import { Import } from './import';
import styles from './menu.module.scss';
import { Tabs } from './tabs';

export type MenuProps = {
  /**
   * package link to be copied
   */
  packageName: string;
  /**
   * import link to be copied
   */
  componentId: string;
  /**
   * registry link to be copied
   */
  registryName: string;
  /**
   * component name to be presented
   */
  componentName: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Menu({ packageName, componentId, registryName, componentName }: MenuProps) {
  const [activeTab, setActiveTab] = useState('bit');
  const [activeRegistry, setActiveRegistry] = useState<string | undefined>(undefined);

  if (activeRegistry === 'import') {
    return <BitInfo prevTab={activeTab} setActive={() => setActiveRegistry(undefined)} />;
  }

  if (activeRegistry === 'install') {
    return (
      <Registry
        prevTab={activeTab}
        registryName={registryName}
        copyString={`npm config set '${registryName}:registry' https://node.bit.dev`}
        setActive={() => setActiveRegistry(undefined)}
      />
    );
  }

  return (
    <div>
      <div className={styles.top}>
        <div className={styles.title}>
          <Icon of="terminal" />
          <span>{`Use ${componentName}`}</span>
        </div>
      </div>
      <Tabs activeTab={activeTab} onClick={setActiveTab} />
      {(activeTab === 'bit' || !activeTab) && (
        <Import
          componentName={componentName}
          componentId={componentId}
          packageName={packageName}
          back={() => setActiveRegistry('import')}
        />
      )}
      {activeTab === 'npm' && (
        <Install
          componentName={componentName}
          registryName={registryName}
          copyString={`npm i ${packageName}`}
          packageManager="npm"
          back={() => setActiveRegistry('install')}
        />
      )}
      {activeTab === 'yarn' && (
        <Install
          componentName={componentName}
          registryName={registryName}
          copyString={`yarn add ${packageName}`}
          packageManager="yarn"
          back={() => setActiveRegistry('install')}
        />
      )}
    </div>
  );
}
