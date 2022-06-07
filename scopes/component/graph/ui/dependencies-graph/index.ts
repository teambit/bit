import componentStyles from './dependencies-graph.module.scss';

export { DependenciesGraph } from './dependencies-graph';
export { ComponentGraphContext, ComponentGraph } from './graph-context';
export type { DependenciesGraphProps } from './dependencies-graph';
export { depTypeToClass, depTypeToLabel } from './dep-edge';
export { calcMinimapColors } from './minimap';
export { calcLayout } from './calc-layout';
export { calcElements } from './calc-elements';

const { graph, minimap, controls } = componentStyles;
export const styles = { graph, minimap, controls };
