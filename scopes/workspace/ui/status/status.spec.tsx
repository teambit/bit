import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { Status, JobStatus } from './status';

describe('Button', () => {
  it('should render a test button', () => {
    const { getByText } = render(<Status status={JobStatus.pass}></Status>);
    const testButton = getByText(/pass/);
    expect(testButton).to.exist;
  });
});
