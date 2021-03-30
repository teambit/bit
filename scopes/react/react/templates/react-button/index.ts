import { ComponentTemplate, GeneratorContext } from '@teambit/generator/component-template';
import { componentFile } from './component';
import { compositionFile } from './composition';
import { docsFile } from './docs';
import { testFile } from './test';

export const reactButton: ComponentTemplate = {
  name: 'react-button',

  generateFiles: (context: GeneratorContext) => {
    const { componentName: name, componentNameCamelCase: Name } = context;
    const indexFile = {
      relativePath: 'index.ts',
      content: `export { ${Name} } from './${name}';`,
    };

    return [indexFile, componentFile(context), compositionFile(context), docsFile(context), testFile(context)];
  },
};
