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
}
