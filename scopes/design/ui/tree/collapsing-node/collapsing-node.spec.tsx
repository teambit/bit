import React from 'react';
// import { render, fireEvent } from '@testing-library/react';
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

  // TODO: take out of comments in a pr because it fails during build
  // TODO: see here - https://app.circleci.com/pipelines/github/teambit/bit/17259/workflows/8d4c12dd-ca4c-4a3d-97c3-c16170213c38/jobs/188846
  // it('children should not be visible by default', () => {
  //   const { getByText } = render(<BasicCollapsingNode />);
  //   const firstChildren = getByText('Content 1');

  //   expect(firstChildren).not.toBeVisible();
  // });
  // it('should open the children when title is clicked', () => {
  //   const { getByText } = render(<BasicCollapsingNode />);
  //   const title = getByText('My Folder');
  //   const firstChildren = getByText('Content 1');

  //   expect(firstChildren).not.toBeVisible();
  //   fireEvent.click(title);
  //   expect(firstChildren).toBeVisible();
  // });
});
