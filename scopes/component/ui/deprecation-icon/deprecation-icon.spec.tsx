import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { ComponentModel } from '@teambit/component';
import { DeprecationIconIsDeprecate } from './deprecation-icon.composition';
import { DeprecationIcon } from './deprecation-icon';

it('should return warning icon', () => {
  const { container } = render(<DeprecationIconIsDeprecate />);
  const span = container.querySelector('span');
  expect(span).to.exist;
});
it('should return null', () => {
  const deprecation = {
    isDeprecate: false,
  };
  // @ts-ignore
  const component = new ComponentModel(null, null, null, null, null, null, null, null, deprecation, null, null);
  const { container } = render(<DeprecationIcon component={component} />);
  const span = container.querySelector('span');
  expect(span).to.null;
});
