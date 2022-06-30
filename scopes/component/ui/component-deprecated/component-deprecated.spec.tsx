import React from 'react';
import { render } from '@testing-library/react';
import { ComponentDeprecatedExample } from './component-deprecated.composition';

it('should render deprecated label when component is deprecated', () => {
  const { getByText } = render(<ComponentDeprecatedExample />);
  const rendered = getByText('Deprecated');

  expect(rendered).toBeTruthy();
});
