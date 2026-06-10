/* eslint-disable complexity */
import { UserAvatar } from '@teambit/design.ui.avatar';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import { VersionLabel } from '@teambit/component.ui.version-label';
import { Link as BaseLink, useLocation } from '@teambit/base-react.navigation.link';
import classNames from 'classnames';
import type { HTMLAttributes } from 'react';
import React, { useMemo, useState } from 'react';
import type { LegacyComponentLog } from '@teambit/legacy-component-log';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';

import styles from './version-block.module.scss';

function ChevronIcon({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <svg
      className={classNames(styles.chevronIcon, collapsed && styles.chevronCollapsed, className)}
      width="12"
      height="8"
      viewBox="0 0 12 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.9999 1.17C10.8126 0.983753 10.5591 0.879211 10.2949 0.879211C10.0308 0.879211 9.77731 0.983753 9.58995 1.17L5.99995 4.71L2.45995 1.17C2.27259 0.983753 2.01913 0.879211 1.75495 0.879211C1.49076 0.879211 1.23731 0.983753 1.04995 1.17C0.95622 1.26297 0.881826 1.37357 0.831057 1.49543C0.780288 1.61729 0.75415 1.74799 0.75415 1.88C0.75415 2.01202 0.780288 2.14272 0.831057 2.26458C0.881826 2.38644 0.95622 2.49704 1.04995 2.59L5.28995 6.83C5.38291 6.92373 5.49351 6.99813 5.61537 7.04889C5.73723 7.09966 5.86794 7.1258 5.99995 7.1258C6.13196 7.1258 6.26267 7.09966 6.38453 7.04889C6.50638 6.99813 6.61699 6.92373 6.70995 6.83L10.9999 2.59C11.0937 2.49704 11.1681 2.38644 11.2188 2.26458C11.2696 2.14272 11.2957 2.01202 11.2957 1.88C11.2957 1.74799 11.2696 1.61729 11.2188 1.49543C11.1681 1.37357 11.0937 1.26297 10.9999 1.17Z"
        fill="var(--bit-text-color-light, #6c707c)"
      />
    </svg>
  );
}

// @todo - this will be fixed as part of the @teambit/base-react.navigation.link upgrade to latest
const Link = BaseLink as any;

export type VersionBlockProps = {
  componentId: string;
  isLatest: boolean;
  snap: LegacyComponentLog;
  isCurrent: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** When true, all entries get card-style borders (used in "expand all" mode) */
  allExpanded?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function VersionBlock({
  isLatest,
  className,
  snap,
  componentId,
  isCurrent,
  collapsed = false,
  onToggleCollapse,
  allExpanded = false,
  ...rest
}: VersionBlockProps) {
  const { username, displayName, email, profileImage, message, tag, hash, date } = snap;
  const { lanesModel } = useLanes();
  const currentLaneUrl = lanesModel?.isViewingNonDefaultLane()
    ? `${LanesModel.getLaneUrl(lanesModel.viewedLane!.id)}${LanesModel.baseLaneComponentRoute}`
    : '';

  const version = tag || hash;
  const isTag = Boolean(tag);
  const displayVersion = tag ? `v${tag}` : hash.slice(0, 7);

  const author = useMemo(
    () => ({
      displayName: displayName || username || '',
      email: email || '',
      name: username || '',
      profileImage: profileImage || '',
    }),
    [displayName, username, email, profileImage]
  );

  const location = useLocation();
  const { pathname } = location || {};

  // Navigate to component page at that version (not the changelog)
  const componentBasePath = pathname?.replace(/\/~changelog.*$/, '') || '';
  const versionUrl = currentLaneUrl
    ? `${currentLaneUrl}/${componentId}?version=${version}`
    : `${componentBasePath}?version=${version}`;

  const { firstLine, rest: restOfMessage } = useCommitMessage(message);
  const [messageExpanded, setMessageExpanded] = useState(false);
  const hasMore = restOfMessage.length > 0;

  const authorDisplay = displayName || username || 'Unknown';

  if (!isTag && collapsed) {
    return (
      <div
        className={classNames(styles.row, styles.snapRow, styles.collapsedRow, className)}
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onToggleCollapse?.()}
        {...rest}
      >
        <div className={styles.dateCol}>
          <TimeAgo className={styles.dateText} date={date ? parseInt(date) : Date.now()} />
        </div>
        <div className={styles.dotCol}>
          <div className={styles.snapDotOuter}>
            <div className={styles.snapDotInner} />
          </div>
        </div>
        <div className={styles.contentCol}>
          <div className={styles.collapsedContent}>
            <Tooltip placement="bottom" content={hash}>
              <span className={styles.snapHash}>{displayVersion}</span>
            </Tooltip>
            <span className={styles.collapsedAuthor}>{authorDisplay}</span>
            <ChevronIcon collapsed className={styles.expandHint} />
          </div>
        </div>
      </div>
    );
  }

  if (!isTag) {
    return (
      <div className={classNames(styles.row, styles.snapRow, className)} {...rest}>
        <div className={styles.dateCol}>
          <TimeAgo className={styles.dateText} date={date ? parseInt(date) : Date.now()} />
        </div>
        <div className={styles.dotCol}>
          <div className={styles.snapDotOuter}>
            <div className={styles.snapDotInner} />
          </div>
        </div>
        <div className={styles.contentCol}>
          <div
            className={styles.snapCard}
            onClick={onToggleCollapse}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onToggleCollapse?.()}
          >
            <div className={styles.headerRow}>
              <Tooltip placement="bottom" content={hash}>
                <Link
                  className={styles.snapVersionLink}
                  href={versionUrl}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  {displayVersion}
                </Link>
              </Tooltip>
              <ChevronIcon className={styles.collapseHint} />
            </div>
            <div className={styles.metaRow}>
              <UserAvatar account={author} size={20} fontSize={8} />
              <span className={styles.authorName}>{authorDisplay}</span>
            </div>
            <div className={styles.messageSection}>
              {firstLine ? (
                <>
                  <div className={styles.firstLine}>{firstLine}</div>
                  {hasMore && (
                    <>
                      {messageExpanded && <div className={styles.restOfMessage}>{restOfMessage}</div>}
                      <button
                        className={styles.expandButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMessageExpanded(!messageExpanded);
                        }}
                        type="button"
                      >
                        {messageExpanded ? 'Show less' : 'Show more'}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div className={styles.emptyMessage}>No commit message</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----- Tag entry -----
  return (
    <div className={classNames(styles.row, styles.tagRow, className)} {...rest}>
      <div className={styles.dateCol}>
        <TimeAgo className={styles.dateText} date={date ? parseInt(date) : Date.now()} />
      </div>
      <div className={styles.dotCol}>
        <div className={styles.tagDotOuter}>
          <div className={styles.tagDotRing}>
            <div className={styles.tagDotInner} />
          </div>
        </div>
      </div>
      <div className={styles.contentCol}>
        <div className={classNames(styles.tagCard, allExpanded && styles.tagCardBordered)}>
          <div className={styles.headerRow}>
            <Tooltip placement="bottom" content={hash}>
              <Link className={styles.versionLink} href={versionUrl}>
                {displayVersion}
              </Link>
            </Tooltip>
            {isLatest && <VersionLabel status="latest" />}
            {isCurrent && <VersionLabel status="current" />}
          </div>
          <div className={styles.metaRow}>
            <UserAvatar account={author} size={20} fontSize={8} />
            <span className={styles.authorName}>{authorDisplay}</span>
          </div>
          <div className={styles.messageSection}>
            {firstLine ? (
              <>
                <div className={styles.firstLine}>{firstLine}</div>
                {hasMore && (
                  <>
                    {messageExpanded && <div className={styles.restOfMessage}>{restOfMessage}</div>}
                    <button
                      className={styles.expandButton}
                      onClick={() => setMessageExpanded(!messageExpanded)}
                      type="button"
                    >
                      {messageExpanded ? 'Show less' : 'Show more'}
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className={styles.emptyMessage}>No commit message</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function useCommitMessage(message: string) {
  return useMemo(() => {
    if (!message) return { firstLine: '', rest: '' };
    const lines = message.split('\n');
    return {
      firstLine: lines[0],
      rest: lines.slice(1).join('\n').trim(),
    };
  }, [message]);
}
