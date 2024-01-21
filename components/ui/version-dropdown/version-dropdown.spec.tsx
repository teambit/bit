import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect } from 'chai';
import { VersionDropdownWithOneVersion, VersionDropdownWithMultipleVersions } from './version-dropdown.composition';

describe('version dropdown tests', () => {
  /**
   *  https://github.com/jsdom/jsdom/issues/1695
   *  scrollIntoView is not implemented in jsdom
   * */
  beforeEach(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });
  it('should render one version', () => {
    const { getByText } = render(<VersionDropdownWithOneVersion />);
    const textVersion = getByText(/^0.1$/);
    expect(textVersion).to.exist;
  });
  it('should not return multiple versions when mounted (lazy loading)', () => {
    render(<VersionDropdownWithMultipleVersions />);
    const textVersionOne = screen.queryByText(/^0.1$/);
    const textVersionTwo = screen.queryByText(/^0.2$/);
    const textVersionThree = screen.getAllByText(/^0.3$/);

    expect(textVersionOne).to.be.null;
    expect(textVersionTwo).to.be.null;
    expect(textVersionThree).to.have.lengthOf.at.least(1);
  });
});
