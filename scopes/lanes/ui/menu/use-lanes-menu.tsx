import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { ExpandableTabContent, TabContent } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import { LaneModel, LanesHost, useLanesContext } from '@teambit/lanes.ui.lanes';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { Link } from '@teambit/base-react.navigation.link';
import styles from './use-lanes-menu.module.scss';

export type LaneImportContentProps = {
  currentLane: LaneModel;
  switchedOutToCurrentLane: boolean;
  host: LanesHost;
} & React.HTMLAttributes<HTMLDivElement>;

export function UseLaneMenu({ host }: { host: LanesHost }) {
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
        content={
          <LaneImportContent host={host} currentLane={viewedLane} switchedOutToCurrentLane={switchedOutToCurrentLane} />
        }
        drawerTitle={<div className={styles.drawerTitle}>Learn more about Lanes</div>}
        drawerContent={<LaneInfo />}
      />
    </div>
  );

  return <UseBoxDropdown position="bottom-end" className={styles.useBox} Menu={Menu} />;
}

function LaneImportContent({ host, currentLane, switchedOutToCurrentLane }: LaneImportContentProps) {
  const laneId = host === 'workspace' ? currentLane.name : currentLane.id;
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
