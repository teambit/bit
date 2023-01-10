import React from 'react';
import { render } from '@testing-library/react';
import { LineTabs } from './responsive-navbar.composition';
import '@testing-library/jest-dom';

describe('ResponsiveNavbar component', () => {
  it('should render correctly link', () => {
    const { getByTestId } = render(<LineTabs />);
    const rendered = getByTestId('responsive-menu');

    expect(rendered).toBeInTheDocument();
  });
  it('should render all tabs twice link', () => {
    const { getAllByText } = render(<LineTabs />);
    ['Tab 1', 'Tab 2', 'Tab 3'].forEach((value) => {
      const renderedValue = getAllByText(value || '');
      expect(renderedValue.length).toBe(2);
      expect(renderedValue[0]).toBeInTheDocument();
      expect(renderedValue[1]).toBeInTheDocument();
    });
  });
});
