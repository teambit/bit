import { Registry } from './registry';

export class Registries {
  constructor(
    /**
     * default registry.
     */
    readonly defaultRegistry: Registry,

    /**
     * map of all scoped registries.
     */
    readonly scopes: Record<string, Registry>
  ) {}

  setDefaultRegistry(registry: Registry): Registries {
    return new Registries(registry, this.scopes);
  }

  updateScopedRegistry(name: string, registry: Registry) {
    const scopes = this.scopes;
    scopes[name] = registry;
    return new Registries(this.defaultRegistry, scopes);
  }
}
