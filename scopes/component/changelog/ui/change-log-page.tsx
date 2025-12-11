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
import React, { useContext } from 'react';

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

  return (
    <div className={classNames(styles.changeLogPage, className)}>
      <H1 className={styles.title}>History</H1>
      <Separator isPresentational className={styles.separator} />
      <div className={styles.logContainer}>
        {logs.map((snap, index) => {
          const isLatest = latest === snap.tag || latest === snap.hash;
          const isCurrent = id?.version === snap.tag || id?.version === snap.hash;
          return (
            <VersionBlock
              key={index}
              componentId={id?.fullName ?? ''}
              isLatest={isLatest}
              snap={snap}
              isCurrent={isCurrent}
            />
          );
        })}
      </div>
    </div>
  );
}
