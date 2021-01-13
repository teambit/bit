import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { ParagraphExample } from './paragraph.composition';

it('should render correctly', () => {
  const { getByTestId } = render(<ParagraphExample />);
  const rendered = getByTestId('test-p');

  expect(rendered).to.exist;
});
it('should render one p element', () => {
  const { container } = render(<ParagraphExample />);
  const rendered = container.querySelectorAll('p');

  expect(rendered.length).to.equal(1);
});
