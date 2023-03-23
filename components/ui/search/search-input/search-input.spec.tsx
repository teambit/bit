import React from 'react';
import { render } from '@testing-library/react';
import { SearchInputWithValue } from './search-input.composition';
import '@testing-library/jest-dom';

describe('should render search input', () => {
  let rendered;
  beforeAll(() => {
    const { getByTestId } = render(<SearchInputWithValue />);
    rendered = getByTestId('search-input');
  });

  it('should be in the document', () => {
    expect(rendered).toBeInTheDocument();
  });
  it('should be input tag', () => {
    expect(rendered.tagName).toBe('INPUT');
  });
  it('should have value', () => {
    expect(rendered.value).toBe('search');
  });
});
