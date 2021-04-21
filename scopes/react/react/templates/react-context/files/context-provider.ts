import { ComponentContext } from '@teambit/generator';

export const contextProviderFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}-context-provider.tsx`,
    content: `import React, { ReactNode } from 'react';
import { ${Name}Context } from './${name}-context';

export type ${Name}ProviderProps = {
  /**
   * primary color of theme.
   */
  color?: string,

  /**
   * children to be rendered within this theme.
   */
  children: ReactNode
};

export function ${Name}Provider({ color, children }: ${Name}ProviderProps) {
  return <${Name}Context.Provider value={{ color }}>{children}</${Name}Context.Provider>
}
`,
  };
};
