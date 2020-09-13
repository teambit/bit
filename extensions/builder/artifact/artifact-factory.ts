import { StorageResolverSlot } from '../builder.main.runtime';
import { ArtifactDefinition } from './artifact-definition';
import { DefaultResolver, StorageResolver } from '../storage';
import { ArtifactList } from './artifact-list';
import { Artifact } from './artifact';

export class ArtifactFactory {
  constructor(private storageResolverSlot: StorageResolverSlot) {}

  getResolver(resolvers: StorageResolver[], name?: string) {
    const defaultResolver = new DefaultResolver();
    const userResolver = resolvers.find((resolver) => resolver.name === name);
    return userResolver || defaultResolver;
  }

  generate(defs: ArtifactDefinition[]): ArtifactList {
    const storageResolvers = this.storageResolverSlot.values();
    const artifacts = defs.map((def) => {
      storageResolvers.find((resolver) => resolver.name);
      const props = Object.assign(def, {
        storageResolver: this.getResolver(storageResolvers, def.storageResolver),
      });
      return Artifact.create(props);
    });
    return new ArtifactList(artifacts);
  }
}
