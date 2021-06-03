import React from 'react';
import { render } from '@testing-library/react';
import { BasicMessageCard } from './message-card.composition';

describe('message-card', () => {
  it('should render with the correct text', () => {
    const { getByText } = render(<BasicMessageCard />);
    const rendered = getByText('message card');
    expect(rendered).toBeTruthy();
  });
});
