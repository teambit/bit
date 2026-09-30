import { Aspect } from '@teambit/harmony';
import { UIRuntime } from '@teambit/harmony.modules.runtimes';

export { UIRuntime };

export const UIAspect = Aspect.create({
  id: 'teambit.ui-foundation/ui',
  declareRuntime: UIRuntime,
});

export default UIAspect;
