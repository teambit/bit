import { ComponentContext } from '@teambit/generator';

export const testFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}-context.spec.tsx`,
    content: `import React from 'react';
import { BasicThemeUsage } from './${name}-context.composition';
import { render } from '@testing-library/react';

describe('${Name}Provider', () => {
  it('should render the button in the color blue', () => {
    const { getByText } = render(<BasicThemeUsage />);

    const rendered = getByText('this should be blue');
    expect(rendered).toBeTruthy();
  });
});
`,
  };
};
