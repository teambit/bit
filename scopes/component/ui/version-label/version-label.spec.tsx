import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { VersionLabelLatest, VersionLabelCheckedOut } from './version-label.composition';

it('should render latest label', () => {
  const { getByText } = render(<VersionLabelLatest />);
  const testLatest = getByText(/latest/);
  expect(testLatest).to.exist;
});
it('should render checked out label', () => {
  const { getByText } = render(<VersionLabelCheckedOut />);
  const testCheckedOut = getByText(/checked out/);
  expect(testCheckedOut).to.exist;
});
