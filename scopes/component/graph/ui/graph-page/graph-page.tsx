import React, { useContext, useState } from 'react';
import { NotFoundPage } from '@teambit/design.ui.pages.not-found';
import { ServerErrorPage } from '@teambit/design.ui.pages.server-error';
import { ComponentContext } from '@teambit/component';
import { skeleton } from '@teambit/design.skeletons.base-skeleton';
import classNames from 'classnames';

import { useGraphQuery } from '../query';
import { DependenciesGraph } from '../dependencies-graph';
import type { ComponentWidgetSlot } from '../../graph.ui.runtime';
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

  const { graph, error, graphLoading, loading } = useGraphQuery([component.id.toString()], filter);

  const isFiltered = filter === 'runtimeOnly';

  if (error) return error.code === 404 ? <NotFoundPage /> : <ServerErrorPage />;

  return (
    <div className={classNames(styles.page)}>
      <DependenciesGraph
        componentWidgets={componentWidgets}
        graph={graph}
        rootNode={component.id}
        className={classNames(styles.graph, !graph && skeleton)}
        loadingGraphMetadata={graphLoading}
      >
        {graph && (
          <GraphFilters
            className={classNames(styles.filters)}
            disable={loading}
            isFiltered={isFiltered}
            onChangeFilter={onCheckFilter}
          />
        )}
      </DependenciesGraph>
    </div>
  );
}
