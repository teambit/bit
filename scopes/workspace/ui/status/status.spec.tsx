import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { StatusFailExample, StatusPassExample, StatusPendingExample, StatusRunningExample } from './status.composition';

describe('Status', () => {
  it('should render a fail status', () => {
    const { getByText } = render(<StatusFailExample />);
    const text = getByText(/fail/);
    expect(text).to.exist;
  });
  it('should render a pass status', () => {
    const { getByText } = render(<StatusPassExample />);
    const text = getByText(/pass/);
    expect(text).to.exist;
  });
  it('should render a pending status', () => {
    const { getByText } = render(<StatusPendingExample />);
    const text = getByText(/pending/);
    expect(text).to.exist;
  });
  it('should render a running status', () => {
    const { getByText } = render(<StatusRunningExample />);
    const text = getByText(/running/);
    expect(text).to.exist;
  });
});
