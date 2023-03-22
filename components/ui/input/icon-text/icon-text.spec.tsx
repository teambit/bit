import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BasicIconTextInput } from './icon-text.composition';

describe('IconText component', () => {
  it('should render input correctly', () => {
    const { getByTestId } = render(<BasicIconTextInput />);
    const rendered = getByTestId('test-input');

    expect(rendered).toBeInTheDocument();
    expect(rendered.tagName).toBe('INPUT');
  });
});
