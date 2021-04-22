import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { MdxPageExample } from './mdx-page.composition';

describe('MdxPage', () => {
  it('should render mdx', () => {
    const { getByText } = render(<MdxPageExample />);
    const rendered = getByText('title-test');

    expect(rendered).to.exist;
  });
});
