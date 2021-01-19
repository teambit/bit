import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import {
  ErrorComponentStatus,
  ModifiedComponentStatus,
  NewComponentStatus,
  StagedComponentStatus,
} from './component-status.composition';

it('should render an error status', () => {
  const { getByText } = render(<ErrorComponentStatus />);
  const testError = getByText(/E/);
  expect(testError).to.exist;
});
it('should render a modified status', () => {
  const { getByText } = render(<ModifiedComponentStatus />);
  const testModified = getByText(/M/);
  expect(testModified).to.exist;
});
it('should render a new status', () => {
  const { getByText } = render(<NewComponentStatus />);
  const testNew = getByText(/N/);
  expect(testNew).to.exist;
});
it('should render a staged status', () => {
  const { getByText } = render(<StagedComponentStatus />);
  const stagedNew = getByText(/S/);
  expect(stagedNew).to.exist;
});
