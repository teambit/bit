import { ComponentTemplate, GeneratorContext } from '@teambit/generator';
import { componentFile } from './component';
import { docsFile } from './docs';

export const reactExtension: ComponentTemplate = {
  name: 'react-extension',

  generateFiles: (context: GeneratorContext) => {
    const { componentName: name, componentNameCamelCase: Name } = context;
    const indexFile = {
      relativePath: 'index.ts',
      content: `import { ${Name}Extension } from './${Name}.extension';
      export { ${Name}Extension };
      export default ${Name}Extension;`,
    };

    return [indexFile, componentFile(context), docsFile(context)];
  },
};
