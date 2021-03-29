import { ComponentTemplate, GeneratorContext } from '@teambit/generator/component-template';

export const reactComponent: ComponentTemplate = {
  name: 'react-component',
  generateFiles: (context: GeneratorContext) => {
    const { componentName, componentNameCamelCase } = context;
    const indexFile = {
      relativePath: 'index.ts',
      content: `export { ${componentNameCamelCase} }  from './${componentName}';`,
    };
    const componentFile = {
      relativePath: `${componentName}.tsx`,
      content: `import React from 'react';

export type ${componentNameCamelCase}Props = {
text: string;
};

export const ${componentNameCamelCase} = ({
text
}: ${componentNameCamelCase}Props) => {
return <p>{text}</p>
};`,
    };
    const compositionFile = {
      relativePath: `${componentName}.composition.tsx`,
      content: `import React from 'react';
import { ${componentNameCamelCase} } from './${componentName}';

export const Basic${componentNameCamelCase} = () => {
return <${componentNameCamelCase} text="hello from ${componentNameCamelCase}" />;
};
`,
    };
    const docsFile = {
      relativePath: `${componentName}.docs.mdx`,
      content: `---
labels: ['react', 'typescript', 'ui', '${componentName}']
description: 'A ${componentNameCamelCase} component.'
---

import { ${componentNameCamelCase} } from './${componentName}';

${componentNameCamelCase} example:

\`\`\`js live
<${componentNameCamelCase} text="hello from ${componentNameCamelCase}"/>
\`\`\`
`,
    };

    const testFile = {
      relativePath: `${componentName}.spec.tsx`,
      content: `import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';

import { Basic${componentNameCamelCase} } from './${componentName}.composition';
describe('${componentName}', () => {

  it('should render the component', () => {
  const { getByText } = render(<Basic${componentNameCamelCase} />);
  const rendered = getByText('hello from ${componentNameCamelCase}');

  expect(rendered).to.exist;
  });
})`,
    };

    return [indexFile, componentFile, compositionFile, docsFile, testFile];
  },
};
