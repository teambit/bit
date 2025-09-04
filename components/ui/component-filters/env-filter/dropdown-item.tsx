import React from 'react';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { Link } from '@teambit/base-react.navigation.link';
import type { EnvFilterEnvState } from './types';
import styles from './envs-filter.module.scss';

export function EnvsPlaceholder({ onClick }: { onClick?: () => void }) {
  return (
    <div className={styles.filterIcon} onClick={onClick}>
      <img src="https://static.bit.dev/bit-icons/env.svg" />
      <span className={styles.filterIconLabel}>Environments</span>
      <div className={styles.dropdownArrow}>
        <img src="https://static.bit.dev/bit-icons/fat-arrow-down.svg" />
      </div>
    </div>
  );
}

export function EnvsDropdownItem({ displayName, icon, description, componentId, id }: EnvFilterEnvState) {
  return (
    <Tooltip
      placement="right"
      content={
        <Link
          className={styles.envLink}
          href={ComponentUrl.toUrl(componentId, { includeVersion: false })}
          external={true}
        >
          {id}
        </Link>
      }
    >
      <div className={styles.envDropdownItemContainer}>
        <div className={styles.envDropdownItem}>
          <Ellipsis>{displayName}</Ellipsis>
          <div className={styles.envDropdownItemIconContainer}>
            <img className={styles.envDropdownItemIcon} src={icon}></img>
          </div>
        </div>
        <div className={styles.description}>
          <Ellipsis className={styles.descriptionText}>{description}</Ellipsis>
        </div>
      </div>
    </Tooltip>
  );
}
