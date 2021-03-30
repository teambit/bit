import { ComponentTemplate, GeneratorContext } from '@teambit/generator/component-template';

export const reactComponent: ComponentTemplate = {
  name: 'react-component',
  generateFiles: (context: GeneratorContext) => {
    const { componentName: component, componentNameCamelCase: Component } = context;

    // index File
    const indexFile = {
      relativePath: 'index.ts',
      content: `export { ${Component} }  from './${component}';`,
    };

    // component File
    const componentFile = {
      relativePath: `${component}.tsx`,
      content: `import React from 'react';

export interface ${Component}Props extends React.HTMLAttributes<HTMLDivElement> {
  children: String
};


export const ${Component} = ( rest: ${Component}Props ) => {
  return (
    <div {...rest}>
      { children }
    </div>
  )
};`,
    };

    // composition File
    const compositionFile = {
      relativePath: `${component}.composition.tsx`,
      content: `import React from 'react';
import { ${Component} } from './${component}';

export const Preview = () => {
  return <${Component}>hello from ${Component}</${Component}>;
};
`,
    };

    // docs File
    const docsFile = {
      relativePath: `${component}.docs.mdx`,
      content: `---
labels: ['react', 'typescript', 'ui', '${component}']
description: 'A ${Component} component.'
---

import { ${Component} } from './${component}';

${Component} example:

\`\`\`js live
<${Component} text="hello from ${Component}"/>
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
    const rendered = getByText('hello from ${Component}');

    expect(rendered).to.exist;
  });
})`,
    };

    return [indexFile, componentFile, compositionFile, docsFile, testFile];
  },
};
