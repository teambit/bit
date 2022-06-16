import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { docFile } from './files/doc';
import { appRoot } from './files/app-root';
import { nodeApp } from './files/node-app';
import { getPort } from './files/get-port';
import { mockRoute } from './files/mock-route';
import { route } from './files/route';
// import { testFile } from './files/test';
// import { compositionFile } from './files/composition';

export const expressAppTemplate: ComponentTemplate = {
  name: 'express-app',
  description: 'a bit express application',
  generateFiles: (context: ComponentContext) => {
    return [
      indexFile(context),
      docFile(context),
      appRoot(context),
      nodeApp(context),
      getPort(),
      mockRoute(),
      route(),
      // compositionFile(context),
      // testFile(context),
    ];
  },
  config: {
    'teambit.harmony/aspect': {},
    'teambit.envs/envs': {
      env: 'teambit.harmony/aspect',
    },
  },
};
