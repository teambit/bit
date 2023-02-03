import { Aspect } from '../../../aspect';
import { RuntimeDefinition } from '../../../runtimes';

export const UIRuntime = RuntimeDefinition.create({ name: 'ui' });

export const UIAspect = Aspect.create({
  id: '@teambit/ui',
  dependencies: [],
  declareRuntime: UIRuntime,
  files: [
    require.resolve('./ui.ui')
  ]
});
