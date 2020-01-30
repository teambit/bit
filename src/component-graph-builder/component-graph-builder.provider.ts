import ComponentGraphBuilder from './component-graph-builder';
import { ComponentResolver } from '../component-resolver-ext';

export type ComponentGraphBuilderDeps = [ComponentResolver];

export type ComponentGraphBuilderConfig = {};

export default async function provideComponentGraphBuilder(
  config: ComponentGraphBuilderConfig,
  [componentResolver]: ComponentGraphBuilderDeps
) {
  const componentGraphBuilder = new ComponentGraphBuilder(componentResolver);
  return componentGraphBuilder;
}
