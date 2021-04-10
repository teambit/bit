import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { componentFile } from './component';
import { compositionFile } from './composition';
import { docsFile } from './docs';
import { testFile } from './test';

export const reactComponentJS: ComponentTemplate = {
  name: 'react-component-js',
  description: 'a generic react component in js',

  generateFiles: (context: ComponentContext) => {
    const { name, namePascalCase: Name } = context;
    const indexFile = {
      relativePath: 'index.js',
      content: `export { ${Name} } from './${name}';
`,
    };

    return [indexFile, componentFile(context), compositionFile(context), docsFile(context), testFile(context)];
  },
};
