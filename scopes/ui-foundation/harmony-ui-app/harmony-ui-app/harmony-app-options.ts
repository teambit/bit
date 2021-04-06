import { AspectDefinition } from '@teambit/aspect-loader';

export type HarmonyAppOptions = {
  /**
   * name of the app. e.g. 'ripple-ci'
   */
  name: string;

  aspectDefs: AspectDefinition[];
};
