/** @flow */
import Component from '../consumer/component';

export default class ComponentDependencies {
  component: Component;
  dependencies: Component[];

  constructor(props: { component: Component, dependencies: Component[] }) {
    this.component = props.component;
    this.dependencies = props.dependencies || [];
  }
}
