import React, { HTMLAttributes, useRef, useEffect } from 'react';
import { LaneId } from '@teambit/lane-id';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { PillLabel } from '@teambit/design.ui.pill-label';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';

import styles from './lane-menu-item.module.scss';

export type LaneMenuItemProps = {
  selected?: LaneId;
  current: LaneId;
} & HTMLAttributes<HTMLDivElement>;

export function LaneMenuItem({ selected, current, className, ...rest }: LaneMenuItemProps) {
  const isCurrent = selected?.toString() === current.toString();

  const currentVersionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isCurrent) {
      currentVersionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isCurrent]);

  const href = LanesModel.getLaneUrl(current);

  return (
    <div {...rest} className={className} ref={currentVersionRef}>
      <MenuLinkItem active={isCurrent} href={href} className={styles.menuItem}>
        <div className={styles.laneName}>{current.name}</div>
        {current.isDefault() && (
          <PillLabel className={styles.defaultLanePill}>
            <span>default</span>
          </PillLabel>
        )}
      </MenuLinkItem>
    </div>
  );
}
