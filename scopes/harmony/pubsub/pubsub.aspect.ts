import { Aspect } from '../harmony/aspect';

export const PubsubAspect = Aspect.create({
  id: 'teambit.harmony/pubsub',
  runtimes: {
    main: () => import('./pubsub.main.runtime'),
    ui: () => import('./pubsub.ui.runtime'),
  },
});

export default PubsubAspect;
