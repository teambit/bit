import React from 'react';
import { render } from '@testing-library/react';
import { InfoLevelIcon } from './level-icon.composition';

describe('level-icon', () => {
  it('should render with the correct text', () => {
    const { getByText } = render(<InfoLevelIcon />);
    const rendered = getByText('hello from LevelIcon');
    expect(rendered).toBeTruthy();
  });
});
