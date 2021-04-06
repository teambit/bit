import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { componentFile } from './component';
import { compositionFile } from './composition';
import { docsFile } from './docs';
import { testFile } from './test';

export const reactComponentJSX: ComponentTemplate = {
  name: 'react-component-jsx',
  description: 'a generic react component in jsx',

  generateFiles: (context: ComponentContext) => {
    const { name, namePascalCase: Name } = context;
    const indexFile = {
      relativePath: 'index.js',
      content: `export { ${Name} } from './${name}';`,
    };

    return [indexFile, componentFile(context), compositionFile(context), docsFile(context), testFile(context)];
  },
};
