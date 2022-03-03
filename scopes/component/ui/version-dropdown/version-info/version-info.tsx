import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import { VersionLabel } from '@teambit/component.ui.version-label';
import React, { useMemo } from 'react';
import classNames from 'classnames';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';

import { DropdownComponentVersion, LOCAL_VERSION } from '../version-dropdown';
import styles from './version-info.module.scss';

export type VersionInfoProps = DropdownComponentVersion & {
  currentVersion?: string;
  latestVersion?: string;
};

export function VersionInfo({ version, currentVersion, latestVersion, date, username, email }: VersionInfoProps) {
  const isCurrent = version === currentVersion;
  const author = useMemo(() => {
    return {
      displayName: username,
      email,
    };
  }, [version]);

  const timestamp = useMemo(() => (date ? new Date(parseInt(date)).toString() : new Date().toString()), [date]);

  return (
    <div key={version}>
      <NavLink
        href={version === LOCAL_VERSION ? '?' : `?version=${version}`}
        className={classNames(styles.versionLine, styles.versionRow, isCurrent && styles.currentVersion)}
      >
        <div className={styles.version}>
          <UserAvatar size={20} account={author} className={styles.versionUserAvatar} />
          <Ellipsis className={styles.versionName}>{version}</Ellipsis>
          {version === latestVersion && <VersionLabel className={styles.label} status="latest" />}
        </div>
        <TimeAgo className={styles.versionTimestamp} date={timestamp} />
      </NavLink>
    </div>
  );
}
