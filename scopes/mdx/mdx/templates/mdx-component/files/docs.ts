import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
description: 'An MDX component.'
labels: ['label1', 'label2', 'label3']
---

import { ${Name} } from './index';

## Static Content Page in MDX

This is a simple MDX-file compiled by Bit to a reuseable component.

### Features
- Compiled output in JS, ready to render as a component in any React app (Gatsby, NextJS, CreateReactApp)
- Customized theming with a [\`ThemeProvider\`](https://bit.dev/teambit/documenter/theme/theme-context)
- Use your own [\`MDXProvider\`](https://mdxjs.com/getting-started/#mdxprovider) (or use this [MDXProvider component](https://bit.dev/teambit/mdx/ui/mdx-layout))

### Component usage
\`\`\`js
<${Name} />
\`\`\`

### Render with theme and MDX providers

\`\`\`js
import { ThemeContext } from '@teambit/documenter.theme.theme-context'
import { MDXLayout } from '@teambit/ui.mdx-layout'
import { ${Name} } from './index'

<ThemeContext>
  <MDXLayout>
    <${Name} />
  </MDXLayout>
</ThemeContext>
\`\`\`
`,
  };
};
