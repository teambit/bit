import React, { HTMLAttributes } from 'react';
import { useRouteMatch } from 'react-router-dom';

import { H2 } from '@teambit/documenter.ui.heading';
import { NotFoundPage } from '@teambit/pages.not-found';
import { ServerErrorPage } from '@teambit/pages.server-error';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';

import { useGraphQuery } from '../query';
import { DependenciesGraph } from '../dependencies-graph';
import { ComponentWidgetSlot } from '../../graph.ui.runtime';

import styles from './graph-page.module.scss';
import { GraphSummery, GraphStats } from './graph-summery';

type GraphPageProps = {
  componentWidgets: ComponentWidgetSlot;
};

const GRAPH_STATS: GraphStats = {
  runtime: 12,
  dev: 12,
  peer: 5,
  total: 29,
  depth: 4,
};

export function GraphPage({ componentWidgets }: GraphPageProps) {
  const {
    params: { componentId },
  } = useRouteMatch();
  const { graph, error } = useGraphQuery([componentId]);

  if (error) {
    // TODO - unify
    return error.code === 404 ? <NotFoundPage /> : <ServerErrorPage />;
  }
  if (!graph) return <FullLoader />;

  return (
    <div className={styles.page}>
      <H2 size="xs">Dependencies</H2>
      <GraphSummery className={styles.summery} stats={GRAPH_STATS} />
      <DependenciesGraph
        componentWidgets={componentWidgets}
        graph={graph}
        rootNode={componentId}
        className={styles.graph}
      />
    </div>
  );
}
