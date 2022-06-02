import styles from './dependencies-graph.module.scss';

export { DependenciesGraph } from './dependencies-graph';
export { ComponentGraphContext, ComponentGraph } from './graph-context';
export type { DependenciesGraphProps } from './dependencies-graph';
export { depTypeToClass, depTypeToLabel } from './dep-edge';
export { calcMinimapColors } from './minimap';
export { calcLayout } from './calc-layout';
export { calcElements } from './calc-elements';

export const graph = styles.graph;
export const minimap = styles.minimap;
export const controls = styles.controls;