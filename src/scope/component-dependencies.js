/** @flow */
import type Component from '../consumer/component/consumer-component';
import BitId from '../bit-id/bit-id';

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
  }

  get allDependencies() {
    return [...this.dependencies, ...this.devDependencies, ...this.compilerDependencies, ...this.testerDependencies];
  }

  hasDependency(id: BitId) {
    this.allDependencies.some(dependency => dependency.id.isEqual(id));
  }
}
