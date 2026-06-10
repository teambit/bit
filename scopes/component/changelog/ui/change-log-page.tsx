import type { ComponentLogsResult, Filters } from '@teambit/component';
import { ComponentContext, useComponentLogs as defaultUseComponentLogs } from '@teambit/component';
import { H1 } from '@teambit/documenter.ui.heading';
import { Separator } from '@teambit/design.ui.separator';
import { VersionBlock } from '@teambit/component.ui.version-block';
import classNames from 'classnames';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { ExportingComponents } from '@teambit/component.instructions.exporting-components';
import { AlertCard } from '@teambit/design.ui.alert-card';
import type { HTMLAttributes } from 'react';
import React, { useContext, useState, useCallback } from 'react';

import styles from './change-log-page.module.scss';

export type ChangeLogPageProps = {
  host?: string;
  useComponentLogs?: (id: string, host: string, filters?: Filters, skip?: boolean) => ComponentLogsResult;
} & HTMLAttributes<HTMLDivElement>;

export function ChangeLogPage({
  className,
  useComponentLogs = defaultUseComponentLogs,
  host = '',
}: ChangeLogPageProps) {
  const component = useContext(ComponentContext);
  const { loading, componentLogs, latest, id } =
    useComponentLogs?.(component?.id.toString(), host, undefined, !component) || {};

  const [showAllSnaps, setShowAllSnaps] = useState(false);
  const [snapOverrides, setSnapOverrides] = useState<Set<string>>(new Set());

  const toggleSnap = useCallback((hash: string) => {
    setSnapOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  }, []);

  if (loading || !componentLogs) return null;

  const { logs = [] } = componentLogs;

  if (logs?.length === 0) {
    return (
      <div className={classNames(styles.changeLogPage, className)}>
        <H1 className={styles.title}>History</H1>
        <Separator isPresentational className={styles.separatorNoChangeLog} />
        <AlertCard
          level="info"
          title="There is no change log as this component has not been exported yet.
          Learn how to export components:"
          className={styles.changeLogCard}
        >
          <MDXLayout>
            <ExportingComponents />
          </MDXLayout>
        </AlertCard>
      </div>
    );
  }

  const hasSnaps = logs.some((l) => !l.tag);

  return (
    <div className={classNames(styles.changeLogPage, className)}>
      <div className={styles.header}>
        <H1 className={styles.title}>History</H1>
        {hasSnaps && (
          <button
            className={styles.showAllToggle}
            onClick={() => {
              setSnapOverrides(new Set());
              setShowAllSnaps(!showAllSnaps);
            }}
            type="button"
          >
            <img
              className={styles.toggleIcon}
              src={
                showAllSnaps
                  ? 'https://static.bit.dev/bit-icons/collapse.svg'
                  : 'https://static.bit.dev/bit-icons/expand.svg'
              }
              alt=""
            />
            {showAllSnaps ? 'Collapse snaps' : 'Show all snaps'}
          </button>
        )}
      </div>
      <div className={styles.timeline}>
        {logs.map((snap) => {
          const isLatest = latest === snap.tag || latest === snap.hash;
          const isCurrent = id?.version === snap.tag || id?.version === snap.hash;
          const isTag = Boolean(snap.tag);
          const hasOverride = snapOverrides.has(snap.hash);
          const isSnapCollapsed = !isTag && (showAllSnaps ? hasOverride : !hasOverride);

          return (
            <VersionBlock
              key={snap.hash}
              componentId={id?.fullName ?? ''}
              isLatest={isLatest}
              snap={snap}
              isCurrent={isCurrent}
              collapsed={isSnapCollapsed}
              onToggleCollapse={!isTag ? () => toggleSnap(snap.hash) : undefined}
              allExpanded={showAllSnaps}
            />
          );
        })}
      </div>
    </div>
  );
}
