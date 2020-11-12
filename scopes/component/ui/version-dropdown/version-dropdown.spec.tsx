/* eslint-disable no-undef */
import React from 'react';
import { render } from '@testing-library/react';
import { VersionDropdownWithOneVerion, VersionDropdownWithMultipleVerions } from './version-dropdown.composition';

describe('Version Dropdown', () => {
  it('should render one version', () => {
    const { getByText } = render(<VersionDropdownWithOneVerion />);
    const textVersion = getByText(/^0.1$/);
    // @ts-ignore
    expect(textVersion).toBeInTheDocument();
  });
  it('should return multiple versions', () => {
    const { getByText, getAllByText } = render(<VersionDropdownWithMultipleVerions />);
    const textVersionOne = getByText(/^0.1$/);
    const textVersionTwo = getByText(/^0.2$/);
    const textVersionThree = getAllByText(/^0.3$/);
    // @ts-ignore
    expect(textVersionOne).toBeInTheDocument();
    // @ts-ignore
    expect(textVersionTwo).toBeInTheDocument();
    // @ts-ignore
    expect(textVersionThree).toHaveLength(2);
  });
});
