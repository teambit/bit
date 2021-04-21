import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { contextFile } from './files/context';
import { contextProviderFile } from './files/context-provider';
import { compositionFile } from './files/composition';
import { docsFile } from './files/docs';
import { testFile } from './files/test';

export const reactContext: ComponentTemplate = {
  name: 'react-context',
  description: 'a react context component',

  generateFiles: (context: ComponentContext) => {
    const { name, namePascalCase: Name } = context;
    const indexFile = {
      relativePath: 'index.ts',
      content: `export { ${Name}Context } from './${name}-context';
export type { ${Name}ContextType } from './${name}-context';
export { ${Name}Provider } from './${name}-context-provider';
export type { ${Name}ProviderProps } from './${name}-context-provider';
`,
    };

    return [
      indexFile,
      contextFile(context),
      contextProviderFile(context),
      compositionFile(context),
      docsFile(context),
      testFile(context),
    ];
  },
};
