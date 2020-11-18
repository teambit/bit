import { ShowFragment, Component } from '@teambit/component';
import { DependencyResolverMain } from '../dependency-resolver.main.runtime';
import { serializeByLifecycle } from './serialize-by-lifecycle';

export class DependenciesFragment implements ShowFragment {
  constructor(private depResolver: DependencyResolverMain) {}

  async renderDependencies(component: Component) {
    const deps = await this.depResolver.getDependencies(component);
    return serializeByLifecycle(deps, 'runtime');
  }

  async json(component: Component) {
    const deps = await this.depResolver.getDependencies(component);
    return {
      title: 'dependencies',
      json: deps.serialize(),
    };
  }

  async renderRow(component: Component) {
    return {
      title: 'dependencies',
      content: await this.renderDependencies(component),
    };
  }
}
