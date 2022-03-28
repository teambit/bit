import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { ExpandableTabContent, TabContent } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';

import { LaneModel, useLanesContext } from '@teambit/lanes.ui.lanes';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { Link } from '@teambit/base-ui.routing.link';
import styles from './use-lanes-menu.module.scss';

export type LaneImportContentProps = {
  currentLane: LaneModel;
  switchedOutToCurrentLane: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function UseLaneMenu() {
  const lanesContext = useLanesContext();
  if (!lanesContext?.viewedLane) return null;
  const { viewedLane, currentLane } = lanesContext;
  const switchedOutToCurrentLane = viewedLane.id === currentLane?.id;
  const Menu = (
    <div className={styles.lanesMenu}>
      <div className={styles.top}>
        <div className={styles.title}>
          <Icon className={styles.titleIcon} of="terminal" />
          <Ellipsis className={styles.titleText}>{`Bulk import from ${viewedLane.name}`}</Ellipsis>
        </div>
      </div>
      <ExpandableTabContent
        content={<LaneImportContent currentLane={viewedLane} switchedOutToCurrentLane={switchedOutToCurrentLane} />}
        drawerTitle={<div className={styles.drawerTitle}>Learn more about Lanes</div>}
        drawerContent={<LaneInfo />}
      />
    </div>
  );

  return <UseBoxDropdown position="bottom-end" className={styles.useBox} Menu={Menu} />;
}

function LaneImportContent({ switchedOutToCurrentLane, currentLane }: LaneImportContentProps) {
  if (switchedOutToCurrentLane) {
    return (
      <div className={styles.importContent}>
        <div className={styles.importContentLabel}>Import everything from {currentLane.name}</div>
        <CopyBox className={styles.importContentCmd}>{`bit merge`}</CopyBox>
      </div>
    );
  }
  return (
    <div className={styles.importContent}>
      <div className={styles.importContentLabel}>Switch and Import everything from {currentLane.name}</div>
      <CopyBox className={styles.importContentCmd}>{`bit switch ${currentLane.name} --get-all`}</CopyBox>
    </div>
  );
}

type LaneInfoProps = {} & React.HTMLAttributes<HTMLDivElement>;

function LaneInfo({ ...rest }: LaneInfoProps) {
  return (
    <div {...rest}>
      <TabContent
        className={styles.moreInfo}
        bottom={
          <Link external href={'https://bit.dev/docs/lanes/lanes-overview'} className={linkStyles}>
            <Icon of="information-sign" />
            <span>Getting Started with Lanes</span>
          </Link>
        }
      ></TabContent>
    </div>
  );
}
