import { ComponentContext } from '@teambit/generator';

export const contextFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}-context.tsx`,
    content: `import { createContext } from 'react';

export type ${Name}ContextType = {
  /**
   * primary color of theme.
   */
  color?: string;
};

export const ${Name}Context = createContext<${Name}ContextType>({
  color: 'aqua'
});
`,
  };
};
