import React from 'react';
import { DependenciesGraph } from '../dependencies-graph';
import { ComponentWidgetSlot } from '../../graph.ui.runtime';

type GraphPageProps = {
  componentWidgets: ComponentWidgetSlot;
};

export function GraphPage({ componentWidgets }: GraphPageProps) {
  return <DependenciesGraph componentWidgets={componentWidgets} />;
}
