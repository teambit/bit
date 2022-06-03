import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import { VersionLabel } from '@teambit/component.ui.version-label';
import React, { useMemo, useRef, useEffect } from 'react';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';

import { DropdownComponentVersion } from '../version-dropdown';
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
  const currentVersionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isCurrent) {
      currentVersionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isCurrent]);

  return (
    <div ref={currentVersionRef}>
      <MenuLinkItem isActive={() => isCurrent} href={`?version=${version}`} className={styles.versionRow}>
        <div className={styles.version}>
          <UserAvatar size={24} account={author} className={styles.versionUserAvatar} showTooltip={true} />
          <Ellipsis className={styles.versionName}>{version}</Ellipsis>
          {version === latestVersion && <VersionLabel className={styles.label} status="latest" />}
        </div>
        <TimeAgo className={styles.versionTimestamp} date={timestamp} />
      </MenuLinkItem>
    </div>
  );
}
