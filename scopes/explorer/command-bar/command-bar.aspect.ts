import { Aspect } from '@teambit/core';

export const CommandBarAspect = Aspect.create({
  id: 'teambit.explorer/command-bar',
  runtimes: {
    ui: () => import('./command-bar.ui.runtime'),
    preview: () => import('./command-bar.preview.runtime'),
  },
});

export default CommandBarAspect;
