import React from 'react';
import { useRouteMatch } from 'react-router-dom';

import { NotFoundPage } from '@teambit/pages.not-found';
import { ServerErrorPage } from '@teambit/pages.server-error';
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
    // TODO - unify
    return error.code === 404 ? <NotFoundPage /> : <ServerErrorPage />;
  }
  if (!graph) return <FullLoader />;

  return (
    <DependenciesGraph
      componentWidgets={componentWidgets}
      graph={graph}
      rootNode={componentId}
      className={styles.graph}
    />
  );
}
