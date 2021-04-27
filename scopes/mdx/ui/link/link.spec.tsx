import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { LinkExample } from './link.composition';

it('should render correctly', () => {
  const { getByTestId } = render(<LinkExample />);
  const rendered = getByTestId('test-link');

  expect(rendered).to.exist;
});
