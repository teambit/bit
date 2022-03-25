import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { ExpandableTabContent } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { BitInfo } from '@teambit/ui-foundation.ui.use-box.bit-info';
import { LaneModel, useLanesContext } from '@teambit/lanes.ui.lanes';
import styles from './use-lanes-menu.module.scss';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';

export type LaneImportContentProps = {
  currentLane: LaneModel;
  switchedOutToCurrentLane: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function UseLaneMenu() {
  const lanesContext = useLanesContext();
  if (!lanesContext?.currentLane) return null;
  const { currentLane, checkedoutLane } = lanesContext;
  const switchedOutToCurrentLane = currentLane.id === checkedoutLane?.id;
  const Menu = (
    <div className={styles.lanesMenu}>
      <div className={styles.top}>
        <div className={styles.title}>
          <Icon of="terminal" />
          <Ellipsis>{`Bulk import from ${currentLane.name}`}</Ellipsis>
        </div>
      </div>
      <ExpandableTabContent
        content={<LaneImportContent currentLane={currentLane} switchedOutToCurrentLane={switchedOutToCurrentLane} />}
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

  return <UseBoxDropdown position="bottom-end" className={styles.useBox} Menu={Menu} />;
}

function LaneImportContent({ switchedOutToCurrentLane, currentLane }: LaneImportContentProps) {
  if (switchedOutToCurrentLane) {
    return (
      <div className={styles.importContent}>
        <div>Import everything from {currentLane.name}</div>
        <CopyBox>{`bit merge`}</CopyBox>
      </div>
    );
  }
  return (
    <div className={styles.importContent}>
      <div>Switch and Import everything from {currentLane.name}</div>
      <CopyBox>{`bit switch ${currentLane.name} --get-all`}</CopyBox>
    </div>
  );
}
