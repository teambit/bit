import React from 'react';
import { render } from '@testing-library/react';
import { PassingMessageCard } from './status-message-card.composition';

describe('status-message-card', () => {
  it('should render with the correct title', () => {
    const { getByText } = render(<PassingMessageCard />);
    const rendered = getByText('success card');
    expect(rendered).toBeTruthy();
  });
});
