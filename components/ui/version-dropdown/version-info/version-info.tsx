import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import { VersionLabel } from '@teambit/component.ui.version-label';
import React, { useMemo, useRef, useEffect } from 'react';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';

import type { DropdownComponentVersion } from '../version-dropdown';
import styles from './version-info.module.scss';

export interface VersionInfoProps extends DropdownComponentVersion {
  currentVersion?: string;
  latestVersion?: string;
  overrideVersionHref?: (version: string) => string;
  showDetails?: boolean;
  onVersionClicked?: () => void;
}

export const VersionInfo = React.memo(React.forwardRef<HTMLDivElement, VersionInfoProps>(_VersionInfo));
function _VersionInfo(
  {
    version,
    currentVersion,
    latestVersion,
    date,
    username,
    displayName,
    email,
    overrideVersionHref,
    showDetails,
    message,
    tag,
    profileImage,
    onVersionClicked,
  }: VersionInfoProps,
  ref?: React.ForwardedRef<HTMLDivElement>
) {
  const isCurrent = version === currentVersion;
  const author = useMemo(() => {
    return {
      displayName: displayName ?? '',
      email,
      name: username ?? '',
      profileImage,
    };
  }, [displayName, email, username, profileImage]);

  const timestamp = useMemo(() => (date ? new Date(parseInt(date)).toString() : new Date().toString()), [date]);
  const currentVersionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isCurrent) {
      currentVersionRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [isCurrent]);

  const href = overrideVersionHref ? overrideVersionHref(version) : `?version=${version}`;

  const formattedVersion = useMemo(() => {
    return tag ? version : version.slice(0, 6);
  }, [tag, version]);

  const isLatest = version === latestVersion;

  return (
    <div ref={ref || currentVersionRef} onClick={onVersionClicked}>
      <MenuLinkItem active={isCurrent} href={href} className={styles.versionRow}>
        <div className={styles.version}>
          <UserAvatar size={24} account={author} className={styles.versionUserAvatar} showTooltip={true} />
          <Ellipsis className={classNames(styles.versionName)}>{formattedVersion}</Ellipsis>
          {isLatest && <VersionLabel status="latest" />}
          <CommitMessage message={message} showDetails={showDetails} />
        </div>
        <Ellipsis className={styles.versionTimestamp}>
          <TimeAgo date={timestamp} />
        </Ellipsis>
      </MenuLinkItem>
    </div>
  );
}

function CommitMessage({ message, showDetails }: { message?: string; showDetails?: boolean }) {
  if (!showDetails) return null;
  if (!message || message === '') return <Ellipsis className={styles.emptyMessage}>No commit message</Ellipsis>;
  return <Ellipsis className={styles.commitMessage}>{message}</Ellipsis>;
}
