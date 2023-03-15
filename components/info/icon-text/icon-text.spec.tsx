import React from 'react';
import { render } from '@testing-library/react';
import { BasicIconText, IconTextWithoutIcon, IconTextWithLink } from './icon-text.composition';

it('should render with the correct text', () => {
  const { getByText } = render(<BasicIconText />);
  const rendered = getByText('Distributed');

  expect(rendered).toBeTruthy();
});

it('should render with the correct text without icon', () => {
  const { getByText } = render(<IconTextWithoutIcon />);
  const rendered = getByText('Just text');

  expect(rendered).toBeTruthy();
});

it('should render with link', () => {
  const { getByText } = render(<IconTextWithLink />);
  const rendered = getByText('https://bit.cloud');

  expect(rendered).toBeTruthy();
});
