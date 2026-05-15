import { Aspect } from '@teambit/core';

/**
 * Wires `@teambit/install`'s `registerPostInstall` callback that touches
 * UI / Bundler when a UI server is running. Split out of `InstallAspect`
 * so CLI commands don't drag in `@teambit/ui` and `@teambit/bundler`
 * (which transitively pull webpack / apollo / graphql) just to register
 * a `bit install` post-hook that only fires under `bit start`.
 */
export const InstallUiBinderAspect = Aspect.create({
  id: 'teambit.workspace/install-ui-binder',
  runtimes: { main: () => import('./install-ui-binder.main.runtime') },
});

export default InstallUiBinderAspect;
