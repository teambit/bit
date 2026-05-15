import { Aspect } from '@teambit/core';

export const VueAspect = Aspect.create({
  id: 'teambit.vue/vue-aspect',
  runtimes: {
    main: () => import('./vue.main.runtime'),
    ui: () => import('./vue.ui.runtime'),
  },
});

export default VueAspect;
