import BitId from '../bit-id/bit-id';
import Component from '../consumer/component/consumer-component';

export default class ComponentWithDependencies {
  component: Component;
  dependencies: Component[];
  devDependencies: Component[];
  extensionDependencies: Component[];
  missingDependencies: BitId[];

  constructor(props: {
    component: Component;
    dependencies: Component[];
    devDependencies: Component[];
    extensionDependencies: Component[];
    missingDependencies?: BitId[];
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

  hasDependency(id: BitId) {
    this.allDependencies.some((dependency) => dependency.id.isEqual(id));
  }
}
