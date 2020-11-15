/* eslint-disable no-undef */
import React from 'react';
import { render } from '@testing-library/react';
import {
  ErrorComponentStatus,
  ModifiedComponentStatus,
  NewComponentStatus,
  StagedComponentStatus,
} from './component-status.composition';

describe('Component Status', () => {
  it('should render an error status', () => {
    const { getByText } = render(<ErrorComponentStatus />);
    const testError = getByText(/E/);
    // @ts-ignore
    expect(testError).toBeInTheDocument();
  });
  it('should render a modified status', () => {
    const { getByText } = render(<ModifiedComponentStatus />);
    const testModified = getByText(/M/);
    // @ts-ignore
    expect(testModified).toBeInTheDocument();
  });
  it('should render a new status', () => {
    const { getByText } = render(<NewComponentStatus />);
    const testNew = getByText(/N/);
    // @ts-ignore
    expect(testNew).toBeInTheDocument();
  });
  it('should render a staged status', () => {
    const { getByText } = render(<StagedComponentStatus />);
    const stagedNew = getByText(/S/);
    // @ts-ignore
    expect(stagedNew).toBeInTheDocument();
  });
});
