import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { EmptyBoxExample } from './empty-box.composition';

describe('emptyBox', () => {
  it('should render with correct title', () => {
    const { getByText } = render(<EmptyBoxExample />);
    const rendered = getByText('title-test');

    expect(rendered).to.exist;
  });

  it('should render with correct href', () => {
    const { getByText } = render(<EmptyBoxExample />);
    const rendered = getByText('link-text');

    // mock renderer includes trailing '/' in the href
    expect(rendered).to.have.property('href').equals('https://link-target/');
  });

  it('should open link in a new tab', () => {
    const { getByText } = render(<EmptyBoxExample />);
    const rendered = getByText('link-text');

    expect(rendered).to.have.property('target').equals('_blank');
  });

  it('should pass props to dom element', () => {
    const { getByTestId } = render(<EmptyBoxExample />);
    const rendered = getByTestId('target');

    expect(rendered).to.have.property('className').to.include('test-class');
  });
});
