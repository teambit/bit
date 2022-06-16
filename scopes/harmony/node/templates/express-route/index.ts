import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { docFile } from './files/doc';
import { mainFile } from './files/main';
// import { testFile } from './files/test';
// import { compositionFile } from './files/composition';

export const expressRouteTemplate: ComponentTemplate = {
  name: 'express-route',
  description: 'an express route',
  generateFiles: (context: ComponentContext) => {
    return [
      indexFile(context),
      docFile(context),
      mainFile(context),
      // compositionFile(context),
      // testFile(context)
    ];
  },
  config: {
    'teambit.harmony/node': {},
    'teambit.envs/envs': {
      env: 'teambit.harmony/node',
    },
  },
};
