import React from 'react';
import { render } from '@testing-library/react';
import { Status, JobStatus } from './status';

describe('Button', () => {
  it('should render a test button', () => {
    const { getByText } = render(<Status status={JobStatus.pass}></Status>);
    const testButton = getByText(/pass/);
    // @ts-ignore
    // eslint-disable-next-line no-undef
    expect(testButton).toBeInTheDocument();
  });
});
