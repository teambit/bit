import { ComponentContext } from '@teambit/generator';

export const testFile = (context: ComponentContext) => {
  const { name } = context;

  return {
    relativePath: `${name}-context.spec.tsx`,
    content: `import { BasicThemeUsage } from './${name}-context.composition';
import { render } from '@testing-library/react';

it('should render the button in the color blue', () => {
  const { getByText } = render(<BasicThemeUsage />);
  const rendered = getByText('this should be blue');
  expect(rendered).toBeTruthy();
});
`,
  };
};
