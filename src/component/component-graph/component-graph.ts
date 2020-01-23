import { Graph } from '../../graph';
import Component from '../component';

export type Dependency = {
  type: 'dev' | 'peer' | 'regular';
};

// TODO: add concrete types
export default class ComponentGraph extends Graph<Component, Dependency> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static resolve(component) {}
}
