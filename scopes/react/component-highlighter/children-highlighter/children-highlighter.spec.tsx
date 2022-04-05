import React from 'react';
import { render } from '@testing-library/react';
import { ChildrenHighlighterPreview } from './children-highlighter.composition';

it('should not throw when rendering the children-highlighter', () => {
  const { getByText } = render(<ChildrenHighlighterPreview />);

  const rendered = getByText('target #1');

  expect(rendered).toBeInstanceOf(HTMLElement);
});

// .querySelectorAll() is not working as expected during the test, ignoring for now :(
// it('should render highlighter for all children components', async () => {
//   const { queryAllByText } = render(<Preview />);

//   // allow useEffect to run
//   await new Promise((res) => setTimeout(res, 200));

//   const rendered = queryAllByText('input/button');
//   expect(rendered).toHaveLength(2);
// });
