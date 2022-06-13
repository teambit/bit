import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import { VersionLabel } from '@teambit/component.ui.version-label';
import React, { useMemo, useRef, useEffect } from 'react';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';

import { DropdownComponentVersion } from '../version-dropdown';
import styles from './version-info.module.scss';

export type VersionInfoProps = DropdownComponentVersion & {
  currentVersion?: string;
  latestVersion?: string;
  overrideVersionHref?: (version: string) => string;
  showDetails?: boolean;
};

export function VersionInfo({
  version,
  currentVersion,
  latestVersion,
  date,
  username,
  email,
  overrideVersionHref,
  showDetails,
  message,
  tag,
}: VersionInfoProps) {
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
      currentVersionRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [isCurrent]);

  const href = overrideVersionHref ? overrideVersionHref(version) : `?version=${version}`;

  return (
    <div ref={currentVersionRef}>
      <MenuLinkItem isActive={() => isCurrent} href={href} className={styles.versionRow}>
        <div className={styles.version}>
          <UserAvatar size={24} account={author} className={styles.versionUserAvatar} showTooltip={true} />
          <Ellipsis className={classNames(styles.versionName, tag && styles.tag, !tag && styles.snap)}>
            {version}
          </Ellipsis>
          {version === latestVersion && <VersionLabel className={styles.label} status="latest" />}
          {showDetails && commitMessage(message)}
        </div>
        <Ellipsis className={styles.versionTimestamp}>
          <TimeAgo date={timestamp} />
        </Ellipsis>
      </MenuLinkItem>
    </div>
  );
}

function commitMessage(message?: string) {
  if (!message || message === '') return <Ellipsis className={styles.emptyMessage}>No commit message</Ellipsis>;
  return <Ellipsis className={styles.commitMessage}>{message}</Ellipsis>;
}
