import { Component } from '@teambit/component';

export class StorageResolverNotFoundError extends Error {
  constructor(private resolverName: string, private component: Component) {
    super(`failed to store artifacts using the ${resolverName} resolver for component ${component.id.toString()}`);
  }
}
