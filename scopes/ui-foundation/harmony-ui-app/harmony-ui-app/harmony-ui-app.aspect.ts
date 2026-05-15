import { Aspect } from '@teambit/core';

export const HarmonyUiAppAspect = Aspect.create({
  id: 'teambit.ui-foundation/harmony-ui-app',
  runtimes: { main: () => import('./harmony-ui-app.main.runtime') },
});
