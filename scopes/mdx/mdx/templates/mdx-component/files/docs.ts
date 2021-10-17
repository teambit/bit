import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
description: 'An MDX component.'
labels: ['content', 'mdx']
---

import { ${Name} } from './index';

### Component usage
\`\`\`js
<${Name} />
\`\`\`

### Render with theme and MDX providers

\`\`\`js
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions'
import { MDXLayout } from '@teambit/ui.mdx-layout'
import { ${Name} } from './index'

<ThemeCompositions>
  <MDXLayout>
    <${Name} />
  </MDXLayout>
</ThemeCompositions>
\`\`\`
`,
  };
};
