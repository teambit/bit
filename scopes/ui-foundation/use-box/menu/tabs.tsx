import React from 'react';
import { Tab } from '@teambit/ui-foundation.ui.use-box.tab';
import styles from './menu.module.scss';

export function Tabs({ onClick, activeTab = 'bit' }: { activeTab: string; onClick: (active: string) => void }) {
  return (
    <div className={styles.tabs}>
      <Tab title="bit" icon="bit" isActive={activeTab === 'bit'} onClick={() => onClick('bit')} />
      <Tab className={styles.npmTab} icon="npm" isActive={activeTab === 'npm'} onClick={() => onClick('npm')} />
      <Tab className={styles.yarnTab} icon="yarn" isActive={activeTab === 'yarn'} onClick={() => onClick('yarn')} />
    </div>
  );
}
