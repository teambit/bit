/* eslint-disable no-undef */
import React from 'react';
import { render } from '@testing-library/react';
import { DeprecationIconIsDeprecate, DeprecationIconIsNotDeprecate } from './deprecation-icon.composition';

describe('Deprecation Icon', () => {
  it('should return warning icon', () => {
    const { container } = render(<DeprecationIconIsDeprecate />);
    const span = container.querySelector('span');
    // @ts-ignore
    expect(span).toBeTruthy();
  });
  it('should return null', () => {
    const { container } = render(<DeprecationIconIsNotDeprecate />);
    const span = container.querySelector('span');
    // @ts-ignore
    expect(span).toBeNull();
  });
});
