import { GeneratorContext } from '@teambit/generator/component-template';

export const testFile = (context: GeneratorContext) => {
  const { componentName: name, componentNameCamelCase: Name } = context;

  return {
    relativePath: `${name}.spec.tsx`,
    content: `import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { Basic${Name} } from './${name}.composition';

describe('${name}', () => {

  it('should render the component', () => {
    const { getByText } = render(<Basic${Name} />);
    const rendered = getByText('click me');
    expect(rendered).to.exist;
  });

})`,
  };
};
