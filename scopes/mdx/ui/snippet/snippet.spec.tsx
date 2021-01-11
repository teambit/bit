import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { SnippetExample, SnippetLiveExample } from './snippet.composition';

it('should render one pre element', () => {
  const { container } = render(<SnippetExample />);
  const rendered = container.querySelectorAll('pre');

  expect(rendered.length).to.equal(1);
});
it('should render snippet live correctly', () => {
  render(<SnippetLiveExample />);
});
