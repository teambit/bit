import React from 'react';
import { render } from '@testing-library/react';
import { BasicSidebar } from './sidebar-loader.composition';

describe('sidebar-loader', () => {
  it('should render with the correct test id', () => {
    const { getByTestId } = render(<BasicSidebar />);
    const rendered = getByTestId('sidebar-skeleton');
    expect(rendered).toBeTruthy();
  });
});
