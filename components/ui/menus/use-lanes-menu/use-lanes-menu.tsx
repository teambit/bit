import React from 'react';
import cx from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
// import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import type { LanesHost } from '@teambit/lanes.ui.models.lanes-model';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { Link as BaseLink } from '@teambit/base-react.navigation.link';
import type { LaneId } from '@teambit/lane-id';
import styles from './use-lanes-menu.module.scss';

// @todo - this will be fixed as part of the @teambit/base-react.navigation.link upgrade to latest
const Link = BaseLink as any;

export type LaneImportContentProps = {
  currentLaneId: LaneId;
  switchedOutToCurrentLane: boolean;
  host: LanesHost;
} & React.HTMLAttributes<HTMLDivElement>;

export function UseLaneMenu({
  host,
  viewedLaneId,
  currentLaneId,
  actionName,
  docsLink = 'https://bit.dev/reference/change-requests/building-lanes',
  actionIcon,
  menuPlaceholderClass,
  menuClassName,
  className,
}: {
  host: LanesHost;
  viewedLaneId: LaneId;
  currentLaneId?: LaneId;
  actionName?: string;
  actionIcon?: string;
  className?: string;
  menuPlaceholderClass?: string;
  menuClassName?: string;
  docsLink?: string;
}) {
  const switchedOutToCurrentLane = !!currentLaneId?.isEqual(currentLaneId);
  const Menu = (
    <div className={cx(styles.lanesMenu, menuClassName)}>
      <div className={styles.top}>
        <div className={styles.title}>
          <Icon className={styles.titleIcon} of="terminal" />
          <Ellipsis className={styles.titleText}>Import lane</Ellipsis>
        </div>
      </div>
      <LaneImportContent host={host} currentLaneId={viewedLaneId} switchedOutToCurrentLane={switchedOutToCurrentLane} />
      <div className={styles.moreInfo}>
        <Link external href={docsLink} className={styles.link}>
          <Icon of="information-sign" />
          <div className={styles.drawerTitle}>Learn more about Lanes</div>
        </Link>
      </div>
    </div>
  );

  return (
    <UseBoxDropdown
      actionName={actionName}
      actionIcon={actionIcon}
      position="bottom-end"
      placeholderClass={menuPlaceholderClass}
      className={cx(styles.useBox, className)}
      Menu={Menu}
    />
  );
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
      <div className={styles.importContentLabel}>Import the lane {laneId}</div>
      <CopyBox className={styles.importContentCmd}>{`bit lane import ${laneId}`}</CopyBox>
    </div>
  );
}
