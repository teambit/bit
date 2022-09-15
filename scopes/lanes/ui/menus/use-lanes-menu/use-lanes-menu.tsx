import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { ExpandableTabContent, TabContent } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import { LanesHost } from '@teambit/lanes.ui.models.lanes-model';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { Link } from '@teambit/base-react.navigation.link';
import { LaneId } from '@teambit/lane-id';
import styles from './use-lanes-menu.module.scss';

export type LaneImportContentProps = {
  currentLaneId: LaneId;
  switchedOutToCurrentLane: boolean;
  host: LanesHost;
} & React.HTMLAttributes<HTMLDivElement>;

export function UseLaneMenu({
  host,
  viewedLaneId,
  currentLaneId,
}: {
  host: LanesHost;
  viewedLaneId: LaneId;
  currentLaneId?: LaneId;
}) {
  const switchedOutToCurrentLane = !!currentLaneId?.isEqual(currentLaneId);
  const Menu = (
    <div className={styles.lanesMenu}>
      <div className={styles.top}>
        <div className={styles.title}>
          <Icon className={styles.titleIcon} of="terminal" />
          <Ellipsis className={styles.titleText}>{`Bulk import from ${viewedLaneId.name}`}</Ellipsis>
        </div>
      </div>
      <ExpandableTabContent
        content={
          <LaneImportContent
            host={host}
            currentLaneId={viewedLaneId}
            switchedOutToCurrentLane={switchedOutToCurrentLane}
          />
        }
        drawerTitle={<div className={styles.drawerTitle}>Learn more about Lanes</div>}
        drawerContent={<LaneInfo />}
      />
    </div>
  );

  return <UseBoxDropdown position="bottom-end" className={styles.useBox} Menu={Menu} />;
}

function LaneImportContent({ host, currentLaneId, switchedOutToCurrentLane }: LaneImportContentProps) {
  const laneId = host === 'workspace' ? currentLaneId.name : currentLaneId.toString();
  if (switchedOutToCurrentLane) {
    return (
      <div className={styles.importContent}>
        <div className={styles.importContentLabel}>Import all components from {laneId}</div>
        <CopyBox className={styles.importContentCmd}>{`bit merge`}</CopyBox>
      </div>
    );
  }
  return (
    <div className={styles.importContent}>
      <div className={styles.importContentLabel}>Switch and Import all components from {laneId}</div>
      <CopyBox className={styles.importContentCmd}>{`bit lane import ${laneId}`}</CopyBox>
    </div>
  );
}

type LaneInfoProps = {} & React.HTMLAttributes<HTMLDivElement>;

function LaneInfo({ ...rest }: LaneInfoProps) {
  return (
    <TabContent
      {...rest}
      className={styles.moreInfo}
      bottom={
        <Link external href={'https://bit.dev/docs/lanes/lanes-overview'} className={linkStyles}>
          <Icon of="information-sign" />
          <span>Getting Started with Lanes</span>
        </Link>
      }
    ></TabContent>
  );
}
