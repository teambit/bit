import React from 'react';
import { render } from '@testing-library/react';
import { BasicJsButton } from './js-button.composition';

it('should render with the correct text', () => {
  const { getByText } = render(<BasicJsButton />);
  const rendered = getByText('hello world!');
  expect(rendered).toBeTruthy();
});
