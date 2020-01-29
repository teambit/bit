import ComponentGraphBuilder from './component-graph-builder';

export type ComponentGraphBuilderDeps = [Bit];

export type ComponentGraphBuilderConfig = {};

export default async function provideComponentGraphBuilder(
  config: ComponentGraphBuilderConfig,
  [ComponentHost]: ComponentGraphBuilderDeps
) {
  const componentGraphBuilder = new ComponentGraphBuilder(ComponentHost);
  return componentGraphBuilder;
}
