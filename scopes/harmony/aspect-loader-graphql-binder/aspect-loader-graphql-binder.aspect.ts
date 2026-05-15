import { Aspect } from '@teambit/core';

/**
 * Wires `@teambit/aspect-loader`'s GraphQL schema into the GraphQL aspect.
 * Split out of `AspectLoaderAspect` so CLI commands don't drag in apollo /
 * graphql via aspect-loader.
 */
export const AspectLoaderGraphqlBinderAspect = Aspect.create({
  id: 'teambit.harmony/aspect-loader-graphql-binder',
  runtimes: { main: () => import('./aspect-loader-graphql-binder.main.runtime') },
});

export default AspectLoaderGraphqlBinderAspect;
