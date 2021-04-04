import { ComponentTemplate, GeneratorContext } from '@teambit/generator';
import { componentFile } from './component';
import { compositionFile } from './composition';
import { docsFile } from './docs';
import { testFile } from './test';

export const reactButton: ComponentTemplate = {
  name: 'react-button',
  description: 'a basic react button',
  generateFiles: (context: GeneratorContext) => {
    const { name, namePascalCase: Name } = context;
    const indexFile = {
      relativePath: 'index.ts',
      content: `export { ${Name} } from './${name}';
export type { ${Name}Props } from './${name}';`,
    };

    return [indexFile, componentFile(context), compositionFile(context), docsFile(context), testFile(context)];
  },
};
