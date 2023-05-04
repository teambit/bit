import React, { HTMLAttributes } from 'react';
import { ComponentContext, useComponent } from '@teambit/component';
import { H1 } from '@teambit/documenter.ui.heading';
import { Separator } from '@teambit/design.ui.separator';
import { VersionBlock } from '@teambit/component.ui.version-block';
import classNames from 'classnames';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { ExportingComponents } from '@teambit/component.instructions.exporting-components';
import { AlertCard } from '@teambit/design.ui.alert-card';

import styles from './change-log-page.module.scss';

type ChangeLogPageProps = {
  host: string;
} & HTMLAttributes<HTMLDivElement>;

export function ChangeLogPage({ className, host }: ChangeLogPageProps) {
  const componentContext = React.useContext(ComponentContext);
  const { component, loading, componentLogs } = useComponent(host, componentContext?.id.toString(), {
    logFilters: {
      log: {
        logLimit: 15,
      },
    },
  });
  const { loadMoreLogs, hasMoreLogs: hasMore } = componentLogs || {};
  const logs = component?.logs ?? [];

  const observer = React.useRef<IntersectionObserver>();
  const handleLoadMore = () => {
    loadMoreLogs?.();
  };

  const lastLogRef = React.useCallback(
    (node) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          handleLoadMore();
        }
      });
      if (node) observer.current.observe(node);
    },
    [loading, hasMore]
  );

  if (loading) return null;

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
        {(logs || []).map((snap, index) => {
          const isLatest = component?.latest === snap.tag || component?.latest === snap.hash;
          const isCurrent = component?.version === snap.tag || component?.version === snap.hash;
          return (
            <VersionBlock
              key={index}
              componentId={component?.id?.fullName || ''}
              isLatest={isLatest}
              snap={snap}
              isCurrent={isCurrent}
              ref={index === logs.length - 1 ? lastLogRef : null}
            />
          );
        })}
      </div>
    </div>
  );
}
