import { RuntimeDefinition } from '@teambit/harmony';
import { Aspect } from '../../harmony/harmony/aspect';

export const UIRuntime = new RuntimeDefinition('ui');

export const UIAspect = Aspect.create({
  id: 'teambit.ui-foundation/ui',
  runtimes: { main: () => import('./ui.main.runtime') },
});

export default UIAspect;
