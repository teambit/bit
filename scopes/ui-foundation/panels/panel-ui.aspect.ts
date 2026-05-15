import { Aspect } from '@teambit/core';

export const PanelUiAspect = Aspect.create({
  id: 'teambit.ui-foundation/panels',
  runtimes: { main: () => import('./panel-ui.main.runtime') },
});
