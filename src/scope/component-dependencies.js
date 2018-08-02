/** @flow */
import Component from '../consumer/component';

export default class ComponentWithDependencies {
  component: Component;
  dependencies: Component[];
  devDependencies: Component[];
  envDependencies: Component[];
  allDependencies: Component[];

  constructor(props: {
    component: Component,
    dependencies: Component[],
    devDependencies: Component[],
    envDependencies: Component[]
  }) {
    this.component = props.component;
    this.dependencies = props.dependencies || [];
    this.devDependencies = props.devDependencies || [];
    this.envDependencies = props.envDependencies || [];
    this.allDependencies = [...this.dependencies, ...this.devDependencies, ...this.envDependencies];
  }
}
