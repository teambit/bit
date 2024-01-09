import { ComponentID } from '@teambit/component-id';
import Component from '../consumer/component/consumer-component';

export default class ComponentWithDependencies {
  component: Component;
  dependencies: Component[];
  devDependencies: Component[];
  extensionDependencies: Component[];
  missingDependencies: ComponentID[];

  constructor(props: {
    component: Component;
    dependencies: Component[];
    devDependencies: Component[];
    extensionDependencies: Component[];
    missingDependencies?: ComponentID[];
  }) {
    this.component = props.component;
    this.dependencies = props.dependencies || [];
    this.devDependencies = props.devDependencies || [];
    this.extensionDependencies = props.extensionDependencies || [];
    this.missingDependencies = props.missingDependencies || [];
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get allDependencies() {
    return [...this.dependencies, ...this.devDependencies, ...this.extensionDependencies];
  }
}
