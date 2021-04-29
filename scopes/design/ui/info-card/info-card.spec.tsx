import React from 'react';
import { render } from '@testing-library/react';
import { BasicInfoCard } from './info-card.composition';

describe('info-card', () => {
  it('should render with the info message', () => {
    const { getByText } = render(<BasicInfoCard />);
    const rendered = getByText('info');
    expect(rendered).toBeTruthy();
  });
});
