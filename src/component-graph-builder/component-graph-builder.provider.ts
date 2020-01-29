import ComponentGraphBuilder from './component-graph-builder';
import { ComponentResolver } from '../component-resolver-ext';

export type ComponentGraphBuilderDeps = [ComponentResolver];

export type ComponentGraphBuilderConfig = {};

export default async function provideComponentGraphBuilder(
  config: ComponentGraphBuilderConfig,
  [ComponentResolver]: ComponentGraphBuilderDeps
) {
  const componentGraphBuilder = new ComponentGraphBuilder(ComponentResolver);
  return componentGraphBuilder;
}
