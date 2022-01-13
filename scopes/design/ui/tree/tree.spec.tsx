import React from 'react';
import { render } from '@testing-library/react';
import { BasicTree } from './tree.composition';

it('should render with the correct text', () => {
  const { getByText } = render(<BasicTree />);
  const rendered = getByText('hello from Tree');
  expect(rendered).toBeTruthy();
});
