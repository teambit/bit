import { ComponentTemplate, GeneratorContext } from '@teambit/generator/component-template';

export const exampleButton: ComponentTemplate = {
  name: 'react-example-button',
  generateFiles: (context: GeneratorContext) => {
    const { componentName: component, componentNameCamelCase: Component } = context;

    // index File
    const indexFile = {
      relativePath: 'index.ts',
      content: `export { Button }  from './${component}';`,
    };

    // Component File
    const componentFile = {
      relativePath: `${component}.tsx`,
      content: `import React from 'react';

export type ${Component}Props = {
  text: string;
};

export const ${Component} = ({ text }: ${Component}Props) => {

  return <button>{text}</button>
};`,
    };

    // composition File
    const compositionFile = {
      relativePath: `${component}.composition.tsx`,
      content: `import React from 'react';
import { ${Component} } from './${component}';

export const Basic${Component} = () => {
  return <${Component} text="click me" />;

};
`,
    };

    // Docs File
    const docsFile = {
      relativePath: `${component}.docs.mdx`,
      content: `---
labels: ['react', 'typescript', 'ui', 'button']
description: 'A ${Component} component.'
---

import { ${Component} } from './${component}';

${Component} example:

\`\`\`js live
<${Component} text="click here"/>
\`\`\`
`,
    };

    // test File
    const testFile = {
      relativePath: `${component}.spec.tsx`,
      content: `import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';

import { Basic${Component} } from './${component}.composition';
describe('${component}', () => {

  it('should render the component', () => {
    const { getByText } = render(<Basic${Component} />);

    const rendered = getByText('click me');

    expect(rendered).to.exist;
  });
})`,
    };

    return [indexFile, componentFile, compositionFile, docsFile, testFile];
  },
};
