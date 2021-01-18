import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { HighlightedTextSpanExample } from './highlighted-text-span.composition';

it('should render correctly', () => {
  const { getByTestId } = render(<HighlightedTextSpanExample />);
  const rendered = getByTestId('test-span');

  expect(rendered).to.exist;
});
it('should render one span element', () => {
  const { container } = render(<HighlightedTextSpanExample />);
  const rendered = container.querySelectorAll('span');

  expect(rendered.length).to.equal(1);
});
