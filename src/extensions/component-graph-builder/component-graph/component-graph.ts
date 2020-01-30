import { Graph } from 'cleargraph';
import Component from '../../component/component';

export type Dependency = {
  type: 'dev' | 'peer' | 'regular';
};

// TODO: add concrete types
export default class ComponentGraph extends Graph<Component, Dependency> {}
