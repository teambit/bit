import React from 'react';
import { render } from '@testing-library/react';
import { Preview } from './router-context.composition';

it.skip('should render with the correct link', () => {
  const { getByText } = render(<Preview />);
  const rendered = getByText('System 1');
  expect(rendered).toBeTruthy();
});
