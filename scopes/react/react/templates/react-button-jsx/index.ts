import { ComponentTemplate, GeneratorContext } from '@teambit/generator';
import { componentFile } from './component';
import { compositionFile } from './composition';
import { docsFile } from './docs';
import { testFile } from './test';

export const reactButtonJSX: ComponentTemplate = {
  name: 'react-button-jsx',
  description: 'a basic react button in jsx',
  generateFiles: (context: GeneratorContext) => {
    const { componentName: name, componentNameCamelCase: Name } = context;
    const indexFile = {
      relativePath: 'index.js',
      content: `export { ${Name} } from './${name}';`,
    };

    return [indexFile, componentFile(context), compositionFile(context), docsFile(context), testFile(context)];
  },
};
