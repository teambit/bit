import { GeneratorContext, ComponentTemplate } from '@teambit/generator/component-template';
import { indexFile } from './files/index';
import { aspectFile } from './files/aspect-file';
import { mainRuntime } from './files/main-runtime';

export const aspectTemplate: ComponentTemplate = {
  name: 'aspect',
  generateFiles: (context: GeneratorContext) => {
    return [mainRuntime(context), aspectFile(context), indexFile(context)];
  },
};
