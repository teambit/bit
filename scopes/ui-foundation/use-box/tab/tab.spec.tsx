import React from 'react';
import { render } from '@testing-library/react';
import { TabWithText, TabWithChildElement, ActiveTab } from './tab.compositions';

describe('basic tab', () => {
  it('should render with the correct text', () => {
    const { getByText } = render(<TabWithText />);
    const rendered = getByText('bit');
    expect(rendered).toBeTruthy();
  });

  it('should render without active class', () => {
    const { getByText } = render(<TabWithText />);
    const rendered = getByText('bit');
    expect(rendered.classList).not.toContain('active');
  });

  it('should accept an element as a child', () => {
    const { getByAltText } = render(<TabWithChildElement />);
    const rendered = getByAltText('bit-logo');
    expect(rendered).toBeTruthy();
  });
});

describe('active tab', () => {
  it('should render with the active class', () => {
    const { getByText } = render(<ActiveTab />);
    const rendered = getByText('bit');
    expect(rendered.classList).toContain('active');
  });
});
