import React from 'react';
import { Tab } from '../tab';
import styles from './menu.module.scss';

export function Tabs({ onClick, activeTab }: { activeTab: string; onClick: (active: string) => void }) {
  return (
    <div className={styles.tabs}>
      <Tab title="bit" icon="bit" isActive={activeTab === 'bit' || !activeTab} onClick={() => onClick('bit')} />
      <Tab
        className={styles.npmTab}
        title="npm"
        icon="npm"
        isActive={activeTab === 'npm'}
        onClick={() => onClick('npm')}
      />
      <Tab
        className={styles.yarnTab}
        title="yarn"
        icon="yarn"
        isActive={activeTab === 'yarn'}
        onClick={() => onClick('yarn')}
      />
    </div>
  );
}
