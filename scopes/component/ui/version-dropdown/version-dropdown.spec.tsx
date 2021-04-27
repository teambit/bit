import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { VersionDropdownWithOneVerion, VersionDropdownWithMultipleVerions } from './version-dropdown.composition';

it('should render one version', () => {
  const { getByText } = render(<VersionDropdownWithOneVerion />);
  const textVersion = getByText(/^0.1$/);
  expect(textVersion).to.exist;
});
it('should return multiple versions', () => {
  const { getByText, getAllByText } = render(<VersionDropdownWithMultipleVerions />);
  const textVersionOne = getByText(/^0.1$/);
  const textVersionTwo = getByText(/^0.2$/);
  const textVersionThree = getAllByText(/^0.3$/);
  expect(textVersionOne).to.exist;
  expect(textVersionTwo).to.exist;
  expect(textVersionThree).to.length(2);
});
