import React, { useContext, useState } from 'react';

import { H2 } from '@teambit/documenter.ui.heading';
import { NotFoundPage } from '@teambit/design.ui.pages.not-found';
import { ServerErrorPage } from '@teambit/design.ui.pages.server-error';
import { ComponentContext } from '@teambit/component';
import { FullLoader } from '@teambit/legacy/dist/to-eject/full-loader';

import { useGraphQuery } from '../query';
import { DependenciesGraph } from '../dependencies-graph';
import { ComponentWidgetSlot } from '../../graph.ui.runtime';
import type { GraphFilter } from '../../model/graph-filters';

import { GraphFilters } from './graph-filters';

import styles from './graph-page.module.scss';

type GraphPageProps = {
  componentWidgets: ComponentWidgetSlot;
};

export function GraphPage({ componentWidgets }: GraphPageProps) {
  const component = useContext(ComponentContext);

  const [filter, setFilter] = useState<GraphFilter>('runtimeOnly');
  const onCheckFilter = (isFiltered: boolean) => {
    setFilter(isFiltered ? 'runtimeOnly' : undefined);
  };

  const { graph, error, loading } = useGraphQuery([component.id.toString()], filter);
  if (error) return error.code === 404 ? <NotFoundPage /> : <ServerErrorPage />;
  if (!graph) return <FullLoader />;

  const isFiltered = filter === 'runtimeOnly';

  return (
    <div className={styles.page}>
      <H2 size="xs">Component Dependencies</H2>
      <DependenciesGraph
        componentWidgets={componentWidgets}
        graph={graph}
        rootNode={component.id}
        className={styles.graph}
      >
        <GraphFilters
          className={styles.filters}
          disable={loading}
          isFiltered={isFiltered}
          onChangeFilter={onCheckFilter}
        />
      </DependenciesGraph>
    </div>
  );
}
