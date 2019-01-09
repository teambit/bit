/** @flow */
import type Component from '../consumer/component/consumer-component';

export default class ComponentWithDependencies {
  component: Component;
  dependencies: Component[];
  devDependencies: Component[];
  compilerDependencies: Component[];
  testerDependencies: Component[];
  allDependencies: Component[];

  constructor(props: {
    component: Component,
    dependencies: Component[],
    devDependencies: Component[],
    compilerDependencies: Component[],
    testerDependencies: Component[]
  }) {
    this.component = props.component;
    this.dependencies = props.dependencies || [];
    this.devDependencies = props.devDependencies || [];
    this.compilerDependencies = props.compilerDependencies || [];
    this.testerDependencies = props.testerDependencies || [];
    this.allDependencies = [
      ...this.dependencies,
      ...this.devDependencies,
      ...this.compilerDependencies,
      ...this.testerDependencies
    ];
  }
}
