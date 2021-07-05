import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { mainRuntimeFile } from './files/main.runtime';
import { previewRuntimeFile } from './files/preview.runtime';
import { docsFile } from './files/docs';
import { aspectFile } from './files/aspect';

export const reactProvider: ComponentTemplate = {
  name: 'react-provider',
  description: 'a react provider component',

  generateFiles: (context: ComponentContext) => {
    const { name, namePascalCase: Name } = context;
    const indexFile = {
      relativePath: 'index.ts',
      content: `import { ${Name}} from './${name}.aspect';

export type { ${Name}Main } from './${name}.main.runtime';
export default ${Name};
export { ${Name} };
`,
    };

    return [indexFile, mainRuntimeFile(context), previewRuntimeFile(context), docsFile(context), aspectFile(context)];
  },
};
