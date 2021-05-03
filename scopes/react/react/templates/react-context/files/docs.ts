import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}-context.docs.mdx`,
    content: `---
description: ${Name} context.
labels: ['context']
---

import { ${Name}Context } from './${name}-context';
import { ${Name}Provider } from './${name}-context-provider';
import { MockComponent } from './${name}-context.composition';

## React Theme Context

This is a simple [React Context](https://reactjs.org/docs/context.html) shared as a Bit component.
Use this component to apply a theme as a context to set on it's children.

### Component usage

\`\`\`tsx
() => {
import React, { useContext } from 'react';
import { ThemeProvider } from './theme-context-provider';
import { ThemeContext } from './theme-context';

<${Name}Provider color="blue">
  // My lovely children now get a theme!
  <MockComponent />
</${Name}Provider>;
\`\`\`

### Using props to customize the theme

Change the color to see the text change:

\`\`\`tsx live
() => {
  return (
    <${Name}Provider color="red">
      <MockComponent />
    </${Name}Provider>
  );
};
\`\`\`
`,
  };
};
