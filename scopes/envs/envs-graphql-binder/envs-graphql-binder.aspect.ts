import { Aspect } from '@teambit/core';

/**
 * Wires `@teambit/envs`'s GraphQL schema into the GraphQL aspect. Split out
 * of `EnvsAspect` so CLI commands don't drag in apollo / graphql via envs.
 */
export const EnvsGraphqlBinderAspect = Aspect.create({
  id: 'teambit.envs/envs-graphql-binder',
  runtimes: { main: () => import('./envs-graphql-binder.main.runtime') },
});

export default EnvsGraphqlBinderAspect;
