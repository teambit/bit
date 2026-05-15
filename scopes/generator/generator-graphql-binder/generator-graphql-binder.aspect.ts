import { Aspect } from '@teambit/core';

/**
 * Wires `@teambit/generator`'s GraphQL schema into the GraphQL aspect.
 * Split out of `GeneratorAspect` so CLI commands don't drag in apollo /
 * graphql via generator.
 */
export const GeneratorGraphqlBinderAspect = Aspect.create({
  id: 'teambit.generator/generator-graphql-binder',
  runtimes: { main: () => import('./generator-graphql-binder.main.runtime') },
});

export default GeneratorGraphqlBinderAspect;
