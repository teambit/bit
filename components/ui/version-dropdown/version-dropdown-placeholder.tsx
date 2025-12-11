import type { HTMLAttributes } from 'react';
import React from 'react';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';
import * as semver from 'semver';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { WordSkeleton } from '@teambit/base-ui.loaders.skeleton';
import type { DropdownComponentVersion } from './version-dropdown';

import styles from './version-dropdown-placeholder.module.scss';

export type VersionProps = {
  currentVersion?: string;
  isTag?: (version?: string) => boolean;
  disabled?: boolean;
  hasMoreVersions?: boolean;
  showFullVersion?: boolean;
  loading?: boolean;
  useCurrentVersionLog?: (props: { skip?: boolean; version?: string }) => DropdownComponentVersion | undefined;
} & HTMLAttributes<HTMLDivElement>;

export function SimpleVersion({
  currentVersion,
  className,
  disabled,
  hasMoreVersions,
  isTag = (version) => semver.valid(version) !== null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  useCurrentVersionLog,
  showFullVersion,
  loading,
  ...rest
}: VersionProps) {
  if (loading) return <WordSkeleton className={styles.loader} length={9} />;
  const formattedVersion = showFullVersion || isTag(currentVersion) ? currentVersion : currentVersion?.slice(0, 6);

  return (
    <div {...rest} className={classNames(styles.simple, className, disabled && styles.disabled)}>
      <Ellipsis className={classNames(styles.versionName)} onClick={rest.onClick}>
        {formattedVersion}
      </Ellipsis>
      {hasMoreVersions && <Icon of="fat-arrow-down" onClick={rest.onClick} />}
    </div>
  );
}

export function DetailedVersion({
  currentVersion,
  className,
  disabled,
  hasMoreVersions,
  isTag = (version) => semver.valid(version) !== null,
  loading,
  useCurrentVersionLog,
  showFullVersion,
  ...rest
}: VersionProps) {
  const currentVersionLog = useCurrentVersionLog?.({ skip: loading, version: currentVersion });
  const { displayName, message, username, email, date: _date, profileImage } = currentVersionLog || {};
  const author = React.useMemo(() => {
    return {
      displayName: displayName ?? '',
      email,
      name: username ?? '',
      profileImage,
    };
  }, [displayName, email, username, profileImage]);
  const formattedVersion = showFullVersion || isTag(currentVersion) ? currentVersion : currentVersion?.slice(0, 6);

  const date = _date ? new Date(+_date) : undefined;
  const timestamp = React.useMemo(() => (date ? new Date(+date).toString() : new Date().toString()), [date]);
  if (loading) return <WordSkeleton className={styles.loader} length={9} />;

  return (
    <div {...rest} className={classNames(styles.detailed, className, disabled && styles.disabled)}>
      <UserAvatar
        size={24}
        account={author ?? {}}
        className={styles.versionUserAvatar}
        showTooltip={true}
        onClick={rest.onClick}
      />
      <Ellipsis className={classNames(styles.versionName)} onClick={rest.onClick}>
        {formattedVersion}
      </Ellipsis>
      {commitMessage(message, rest.onClick)}
      <Ellipsis className={styles.versionTimestamp} onClick={rest.onClick}>
        <TimeAgo date={timestamp} onClick={rest.onClick} />
      </Ellipsis>
      {hasMoreVersions && <Icon of="fat-arrow-down" onClick={rest.onClick} />}
    </div>
  );
}

function commitMessage(message?: string, onClick?: React.MouseEventHandler<HTMLDivElement> | undefined) {
  if (!message || message === '')
    return (
      <Ellipsis className={styles.emptyMessage} onClick={onClick}>
        No commit message
      </Ellipsis>
    );
  return (
    <Ellipsis className={styles.commitMessage} onClick={onClick}>
      {message}
    </Ellipsis>
  );
}
