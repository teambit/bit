import { LaneModel, LanesModel } from '@teambit/lanes.ui.lanes';
import React from 'react';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './lane-info.module.scss';

export type LaneInfoProps = LaneModel & { currentLane?: LaneModel };

export function LaneInfo({ id, currentLane }: LaneInfoProps) {
  const isCurrent = currentLane?.id === id;

  return (
    <div key={id}>
      <MenuLinkItem active={isCurrent} href={LanesModel.getLaneUrl(id)} className={styles.versionRow}>
        <span>
          <Icon className={styles.laneIcon} of="lane"></Icon>
          {id}
        </span>
      </MenuLinkItem>
    </div>
  );
}
