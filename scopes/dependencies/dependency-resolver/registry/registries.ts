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
}
