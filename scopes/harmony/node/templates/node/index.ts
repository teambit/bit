import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { docFile } from './files/doc';
import { mainFile } from './files/main';
import { testFile } from './files/test';
import { compositionFile } from './files/composition';

export const nodeTemplate: ComponentTemplate = {
  name: 'node',
  description: 'a Node.js package',
  generateFiles: (context: ComponentContext) => {
    return [indexFile(context), docFile(context), mainFile(context), compositionFile(context), testFile(context)];
  },
};
