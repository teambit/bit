/* eslint-disable no-undef */
import React from 'react';
import { render } from '@testing-library/react';
import { VersionLabelLatest, VersionLabelCheckedOut } from './version-label.composition';

describe('Version Label', () => {
  it('should render latest label', () => {
    const { getByText } = render(<VersionLabelLatest />);
    const testLatest = getByText(/latest/);
    // @ts-ignore
    expect(testLatest).toBeInTheDocument();
  });
  it('should render checked out label', () => {
    const { getByText } = render(<VersionLabelCheckedOut />);
    const testCheckedOut = getByText(/checked out/);
    // @ts-ignore
    expect(testCheckedOut).toBeInTheDocument();
  });
});
