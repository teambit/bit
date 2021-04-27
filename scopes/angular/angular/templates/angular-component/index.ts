import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { componentFile } from './files/component';
import { moduleFile } from './files/module';
import { docsFile } from './files/docs';
import { testFile } from './files/test';

export const angularModule: ComponentTemplate = {
  name: 'ng-module',
  description: 'a generic Angular module with a component',
  hidden: true, // TODO(ocombe): remove this before release

  generateFiles: (context: ComponentContext) => {
    const { name } = context;
    const indexFile = {
      relativePath: 'public_api.ts',
      content: `export * from './${name}.component';
export * from './${name}.module';
`,
    };

    return [indexFile, componentFile(context), moduleFile(context), docsFile(context), testFile(context)];
  },
};
