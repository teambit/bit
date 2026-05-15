import { Aspect } from '@teambit/core';

/**
 * Wires `ScopeMain`'s UI root and GraphQL schema into the UI / graphql
 * aspects. Split out of `ScopeAspect` so CLI commands don't drag in the
 * UI / apollo / graphql chain via the scope.
 */
export const ScopeUiBinderAspect = Aspect.create({
  id: 'teambit.scope/scope-ui-binder',
  runtimes: { main: () => import('./scope-ui-binder.main.runtime') },
});

export default ScopeUiBinderAspect;
