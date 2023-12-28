import React from 'react';
import { render, within } from '@testing-library/react';

import { componentMock, componentSnapMock } from '../../component-card.mocks';
import { ComponentDetails } from './details';

export const ComponentDetailsSection = () => {
  // @ts-ignore
  return (
    // @ts-ignore
    <ComponentDetails
      data-testid="ComponentDetailsSection"
      // @ts-ignore
      componentId={componentMock.id}
      description="description to be presented here"
    />
  );
};

export const ComponentDetailsSectionWithMock = () => {
  return (
    // @ts-ignore
    <ComponentDetails
      data-testid="ComponentDetailsSection"
      componentId={componentSnapMock.id as any}
      description="description to be presented here"
    />
  );
};

describe.skip('component details section', () => {
  it('should render details section', () => {
    const { getByTestId } = render(<ComponentDetailsSection />);
    const rendered = getByTestId('ComponentDetailsSection');
    expect(rendered).toBeTruthy();
  });
  it('should render description text', () => {
    const { getByTestId } = render(<ComponentDetailsSection />);
    const { getByText } = within(getByTestId('ComponentDetailsSection'));
    const text = getByText('description to be presented here');
    expect(text).toBeInTheDocument();
  });
  it('should render version with "v" prefix if valid semver version', () => {
    const { getByTestId } = render(<ComponentDetailsSection />);
    const { getByText } = within(getByTestId('ComponentDetailsSection'));
    expect(getByText('v0.0.1')).toBeInTheDocument();
  });
  it('should not add "v" prefix if not a valid semver version', () => {
    const { getByTestId } = render(<ComponentDetailsSectionWithMock />);
    const { getByText } = within(getByTestId('ComponentDetailsSection'));
    expect(getByText('90BA8E42F0820B22E76E477624FB2AAA16B125CAA144D94BECA223324DA54733')).toBeInTheDocument();
  });
});
