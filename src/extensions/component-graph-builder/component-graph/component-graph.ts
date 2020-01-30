import { Graph, EdgeData } from 'cleargraph';
import Component from '../../../component/component';

export type Dependency = EdgeData & {
  type: 'dev' | 'peer' | 'regular';
};

// TODO: add concrete types
export default class ComponentGraph extends Graph<Component, Dependency> {}
