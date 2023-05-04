import React, { HTMLAttributes } from 'react';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';
import * as semver from 'semver';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import { UserAvatar } from '@teambit/design.ui.avatar';

import styles from './version-dropdown-placeholder.module.scss';

export type VersionProps = {
  currentVersion?: string;
  timestamp?: string | number;
  author?: {
    displayName?: string;
    email?: string;
  };
  message?: string;
  disabled?: boolean;
  hasMoreVersions?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function SimpleVersion({
  currentVersion,
  className,
  disabled,
  hasMoreVersions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  author,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  message,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  timestamp,
  ...rest
}: VersionProps) {
  const isTag = semver.valid(currentVersion);

  return (
    <div {...rest} className={classNames(styles.simple, className, disabled && styles.disabled)}>
      <Ellipsis
        className={classNames(styles.versionName, isTag && styles.tag, !isTag && styles.snap)}
        onClick={rest.onClick}
      >
        {currentVersion}
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
  timestamp,
  author,
  message,
  ...rest
}: VersionProps) {
  const isTag = semver.valid(currentVersion);

  return (
    <div {...rest} className={classNames(styles.detailed, className, disabled && styles.disabled)}>
      <UserAvatar size={24} account={author ?? {}} className={styles.versionUserAvatar} showTooltip={true} />
      <Ellipsis
        className={classNames(styles.versionName, isTag && styles.tag, !isTag && styles.snap)}
        onClick={rest.onClick}
      >
        {currentVersion}
      </Ellipsis>
      {commitMessage(message)}
      <Ellipsis className={styles.versionTimestamp} onClick={rest.onClick}>
        <TimeAgo date={timestamp ?? ''} onClick={rest.onClick} />
      </Ellipsis>
      {hasMoreVersions && <Icon of="fat-arrow-down" onClick={rest.onClick} />}
    </div>
  );
}

function commitMessage(message?: string) {
  if (!message || message === '') return <Ellipsis className={styles.emptyMessage}>No commit message</Ellipsis>;
  return <Ellipsis className={styles.commitMessage}>{message}</Ellipsis>;
}
