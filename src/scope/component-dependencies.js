/** @flow */
import Component from '../consumer/component';

export default class ComponentWithDependencies {
  component: Component;
  dependencies: Component[];
  devDependencies: Component[];

  constructor(props: { component: Component, dependencies: Component[], devDependencies: Component[] }) {
    this.component = props.component;
    this.dependencies = props.dependencies || [];
    this.devDependencies = props.devDependencies || [];
  }
}
