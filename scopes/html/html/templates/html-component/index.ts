import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { componentFile } from './files/component';
import { compositionFile } from './files/composition';
import { docsFile } from './files/docs';
import { testFile } from './files/test';

export const htmlComponentTemplate: ComponentTemplate = {
  name: 'html',
  description: 'a basic html component',

  generateFiles: (context: ComponentContext) => {
    const { name, namePascalCase: Name } = context;
    const indexFile = {
      relativePath: 'index.ts',
      content: `export { ${Name} } from './${name}';
export type { ${Name}Props } from './${name}';
`,
    };

    return [indexFile, componentFile(context), compositionFile(context), docsFile(context), testFile(context)];
  },

  config: {
    'teambit.html/html': {},
    'teambit.envs/envs': {
      env: 'teambit.html/html',
    },
  },
};

export const deprecatedHtmlComponentTemplate: ComponentTemplate = {
  name: 'html-component',
  description: 'a basic html component',
  hidden: true,

  generateFiles: (context: ComponentContext) => {
    const { name, namePascalCase: Name } = context;
    const indexFile = {
      relativePath: 'index.ts',
      content: `export { ${Name} } from './${name}';
export type { ${Name}Props } from './${name}';
`,
    };

    return [indexFile, componentFile(context), compositionFile(context), docsFile(context), testFile(context)];
  },
  config: {
    'teambit.html/html': {},
    'teambit.envs/envs': {
      env: 'teambit.html/html',
    },
  },
};
