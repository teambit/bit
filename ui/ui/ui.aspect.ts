import { Aspect, RuntimeDefinition } from '@teambit/harmony';

export const UIRuntime = new RuntimeDefinition('ui');

export const UIAspect = Aspect.create({
  id: 'teambit.ui/ui',
  dependencies: [],
  defaultConfig: {},
  declareRuntime: UIRuntime,
});

export default UIAspect;
