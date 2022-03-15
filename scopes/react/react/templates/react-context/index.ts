import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { contextFile } from './files/context';
import { contextProviderFile } from './files/context-provider';
import { compositionFile } from './files/composition';
import { docsFile } from './files/docs';
import { testFile } from './files/test';
import { indexFile } from './files/index-file';

export const reactContext: ComponentTemplate = {
  name: 'react-context',
  description: 'a react context component',

  generateFiles: (context: ComponentContext) => {
    return [
      indexFile(context),
      contextFile(context),
      contextProviderFile(context),
      compositionFile(context),
      docsFile(context),
      testFile(context),
    ];
  },
  config: {
    'teambit.react/react': {},
    'teambit.envs/envs': {
      env: 'teambit.react/react',
    },
  },
};
