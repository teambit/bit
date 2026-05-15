// UI value exports removed from this barrel:
//   - DependenciesCompare (was: './ui/dependencies-compare')
//   - calcElements / calcLayout / etc. (was: './ui/dependencies-graph')
//   - GraphFilters / graphPageStyles (was: './ui/graph-page')
//   - EdgeModel / GraphModel / NodeModel / useGraph / useGraphQuery (was: './ui/query')
//   - componentNodeStyles / root / defaultNode / external (was: './ui/component-node')
// UI callers should import from those paths directly.
export { Dependency, DependencyType } from './model/dependency';
export { DuplicateDependency } from './duplicate-dependency';
export { GraphAspect as default, GraphAspect } from './graph.aspect';
export type { RawGraph } from './ui/query';
export type { CompIdGraph, DepEdgeType, ComponentIdGraph } from './component-id-graph';
export type { ComponentGraph } from './component-graph';
export type { ComponentWidget, ComponentWidgetProps, ComponentWidgetSlot, GraphUI } from './graph.ui.runtime';
export { EdgeType } from './edge-type';
export type { GraphBuilder } from './graph-builder';
export type { GraphFilter } from './model/graph-filters';
export type { GraphMain } from './graph.main.runtime';
export type { VersionSubgraph } from './duplicate-dependency';
