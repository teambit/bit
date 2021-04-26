import { ComponentContext } from '@teambit/generator';

export const compositionFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}-context.composition.tsx`,
    content: `import React, { useContext } from 'react';
import { ${Name}Provider } from './${name}-context-provider';
import { ${Name}Context } from './${name}-context';

export function MockComponent() {
  const theme = useContext(${Name}Context);

  return <div style={{ color: theme.color }}>this should be {theme.color}</div>;
}

export const BasicThemeUsage = () => {
  return (
    <${Name}Provider color="blue">
      <MockComponent />
    </${Name}Provider>
  );
};
`,
  };
};
