/** @flow */
import Component from '../consumer/component';
import { fromBase64 } from '../utils';

export default class ComponentDependencies {
  component: Component;
  dependencies: Component[];

  constructor(props: { component: Component, dependencies: Component[] }) {
    this.component = props.component;
    this.dependencies = props.dependencies || [];
  }
}
