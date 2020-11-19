import { ShowFragment, Component } from '@teambit/component';
import { DependencyResolverMain } from '../dependency-resolver.main.runtime';
import { serializeByLifecycle } from './serialize-by-lifecycle';

export class PeerDependenciesFragment implements ShowFragment {
  constructor(private depResolver: DependencyResolverMain) {}

  async renderPeerDependencies(component: Component) {
    const deps = await this.depResolver.getDependencies(component);
    return serializeByLifecycle(deps, 'peer');
  }

  async renderRow(component: Component) {
    return {
      title: 'peer dependencies',
      content: await this.renderPeerDependencies(component),
    };
  }
}
