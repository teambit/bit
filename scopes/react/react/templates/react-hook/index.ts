import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { componentFile } from './files/component';
import { compositionFile } from './files/composition';
import { docsFile } from './files/docs';
import { testFile } from './files/test';
import { indexFile } from './files/index-file';

export const reactHook: ComponentTemplate = {
  name: 'react-hook',
  description: 'a react hook component',

  generateFiles: (context: ComponentContext) => {
    return [indexFile(context), componentFile(context), compositionFile(context), docsFile(context), testFile(context)];
  },
  config: {
    'teambit.react/react': {},
    'teambit.envs/envs': {
      env: 'teambit.react/react',
    },
  },
};
