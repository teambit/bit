import { ShowFragment, Component } from '@teambit/component';
import { DependencyResolverMain } from '../dependency-resolver.main.runtime';
import { serializeByLifecycle } from './serialize-by-lifecycle';

export class DevDependenciesFragment implements ShowFragment {
  constructor(private depResolver: DependencyResolverMain) {}

  async renderDevDependencies(component: Component) {
    const deps = await this.depResolver.getDependencies(component);
    return serializeByLifecycle(deps, 'dev');
  }

  async renderRow(component: Component) {
    return {
      title: 'dev dependencies',
      content: await this.renderDevDependencies(component),
    };
  }
}
