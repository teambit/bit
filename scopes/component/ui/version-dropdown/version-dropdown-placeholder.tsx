import React, { HTMLAttributes, useMemo } from 'react';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { DropdownComponentVersion } from './version-dropdown';

import styles from './version-dropdown-placeholder.module.scss';

export type VersionProps = {
  tags: DropdownComponentVersion[];
  snaps?: DropdownComponentVersion[];
  currentVersion: string;
  disabled?: boolean;
} & HTMLAttributes<HTMLDivElement>;

const getVersionDetailFromTags = (version, tags) => tags.find((tag) => tag.tag === version);
const getVersionDetailFromSnaps = (version, snaps) => (snaps || []).find((snap) => snap.hash === version);
const getVersionDetails = (version, tags, snaps) => {
  if (version === 'workspace' || version === 'new') return { version };
  return getVersionDetailFromTags(version, tags) || getVersionDetailFromSnaps(version, snaps);
};

export function SimpleVersion({ currentVersion, className, disabled, tags, snaps }: VersionProps) {
  const versionDetails = useMemo(() => getVersionDetails(currentVersion, tags, snaps), [currentVersion, tags, snaps]);

  return (
    <div className={classNames(styles.simple, className, disabled && styles.disabled)}>
      <Ellipsis
        className={classNames(
          styles.versionName,
          versionDetails?.tag && styles.tag,
          !versionDetails?.tag && styles.snap
        )}
      >
        {currentVersion}
      </Ellipsis>
      <Icon of="fat-arrow-down" />
    </div>
  );
}

export function DetailedVersion({ currentVersion, className, disabled, snaps, tags }: VersionProps) {
  const versionDetails = useMemo(() => getVersionDetails(currentVersion, tags, snaps), [currentVersion, tags, snaps]);

  const timestamp = useMemo(
    () => (versionDetails?.date ? new Date(parseInt(versionDetails.date)).toString() : new Date().toString()),
    [versionDetails?.date]
  );

  const author = useMemo(() => {
    return {
      displayName: versionDetails?.username,
      email: versionDetails?.email,
    };
  }, [versionDetails]);

  return (
    <div className={classNames(styles.detailed, className, disabled && styles.disabled)}>
      <UserAvatar size={24} account={author} className={styles.versionUserAvatar} showTooltip={true} />
      <Ellipsis
        className={classNames(
          styles.versionName,
          versionDetails?.tag && styles.tag,
          !versionDetails?.tag && styles.snap
        )}
      >
        {currentVersion}
      </Ellipsis>
      <div className={styles.author}>{author?.displayName}</div>
      {commitMessage(versionDetails?.message)}
      <Ellipsis className={styles.versionTimestamp}>
        <TimeAgo date={timestamp} />
      </Ellipsis>
      <Icon of="fat-arrow-down" />
    </div>
  );
}

function commitMessage(message?: string) {
  if (!message || message === '') return <Ellipsis className={styles.emptyMessage}>No commit message</Ellipsis>;
  return <Ellipsis className={styles.commitMessage}>{message}</Ellipsis>;
}
