import React from 'react';
import { render } from '@testing-library/react';
import { DefaultTextExample, TextWithBackgroundColorExample } from './scope-icon.composition';

it('should render correctly', () => {
  const { getByTestId } = render(<DefaultTextExample data-testid="test-icon" />);
  const rendered = getByTestId('test-icon');

  expect(rendered).toBeTruthy();
});

it('should render with inline back-ground style in main div element', () => {
  const { container } = render(<TextWithBackgroundColorExample />);
  const div = container.querySelector('div');

  expect(div?.style.backgroundColor).toEqual('black');
});
