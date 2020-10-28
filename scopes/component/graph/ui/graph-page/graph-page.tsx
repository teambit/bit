import React from 'react';
import { useRouteMatch } from 'react-router-dom';

import { H2 } from '@teambit/documenter.ui.heading';
import { NotFoundPage } from '@teambit/ui.pages.not-found';
import { ServerErrorPage } from '@teambit/ui.pages.server-error';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';

import { useGraphQuery } from '../query';
import { DependenciesGraph } from '../dependencies-graph';
import { ComponentWidgetSlot } from '../../graph.ui.runtime';

import styles from './graph-page.module.scss';

type GraphPageProps = {
  componentWidgets: ComponentWidgetSlot;
};

export function GraphPage({ componentWidgets }: GraphPageProps) {
  const {
    params: { componentId },
  } = useRouteMatch();
  const { graph, error } = useGraphQuery([componentId]);

  if (error) {
    return error.code === 404 ? <NotFoundPage /> : <ServerErrorPage />;
  }
  if (!graph) return <FullLoader />;

  return (
    <div className={styles.page}>
      <H2 size="xs">Dependencies</H2>
      <DependenciesGraph
        componentWidgets={componentWidgets}
        graph={graph}
        rootNode={componentId}
        className={styles.graph}
      />
    </div>
  );
}
