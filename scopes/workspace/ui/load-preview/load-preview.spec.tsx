import React from 'react';
import { render } from '@testing-library/react';
import { expect } from 'chai';
import { LoadPreviewExample } from './load-preview.composition';

it('should return correctly', () => {
  const { getByTestId } = render(<LoadPreviewExample data-testid="test-load-preview" />);
  const rendered = getByTestId('test-load-preview');
  expect(rendered).to.exist;
});
