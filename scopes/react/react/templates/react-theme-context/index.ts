import { ComponentTemplate, ComponentContext } from '@teambit/generator';
import { themeContextFile } from './files/theme-context';
import { themeContextProviderFile } from './files/theme-context-provider';
import { compositionFile } from './files/composition';
import { docsFile } from './files/docs';
import { testFile } from './files/test';

export const reactThemeContext: ComponentTemplate = {
  name: 'react-theme-context',
  description: 'a generic react theme-context component',

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
      themeContextFile(context),
      themeContextProviderFile(context),
      compositionFile(context),
      docsFile(context),
      testFile(context),
    ];
  },
};
