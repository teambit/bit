import React from 'react';
import { render } from '@testing-library/react';
import { BasicCollapsingNode } from './collapsing-node.examples';

describe('should render Collapsing tree node', () => {
  it('should render with the title text', () => {
    const { getByText } = render(<BasicCollapsingNode />);
    const rendered = getByText('My Folder');

    expect(rendered).toBeTruthy();
  });
  it('should render with childrens text', () => {
    const { getByText } = render(<BasicCollapsingNode />);
    for (let index = 1; index <= 5; index += 1) {
      const rendered = getByText(`Content ${1}`);
      expect(rendered).toBeTruthy();
    }
  });

  // it('childrens should not be visible by default', () => {
  //   const { getByText } = render(<BasicCollapsingNode />);
  //   const firstChildren = getByText('Content 1');

  //   expect(firstChildren).not.toBeVisible();
  // });
  // it('should open the childrens when title is clicked', () => {
  //   const { getByText } = render(<BasicCollapsingNode />);
  //   const title = getByText('My Folder');
  //   const firstChildren = getByText('Content 1');

  //   expect(firstChildren).not.toBeVisible();
  //   fireEvent.click(title);
  //   expect(firstChildren).toBeVisible();
  // });
});
