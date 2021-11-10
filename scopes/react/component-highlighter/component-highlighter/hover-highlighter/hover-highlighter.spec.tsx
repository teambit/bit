import React, { ReactNode } from 'react';
import { act } from 'react-dom/test-utils';
import { render, fireEvent, waitForElementToBeRemoved } from '@testing-library/react';
import { ComponentMeta, componentMetaField } from '@teambit/react.babel.bit-react-transformer';

import { HoverHighlighter } from './hover-highlighter';

const debounceTime = 1;

function ButtonComponent({ children }: { children: ReactNode }) {
  return <button>{children}</button>;
}

ButtonComponent[componentMetaField] = {
  // could use a non-bit-id to render the "default" bubble
  id: 'teambit.base-ui/input/button',
} as ComponentMeta;

it('should show bubble when hovering on element with bit id', async () => {
  const { getByText, findByText } = render(
    <HoverHighlighter debounceSelection={debounceTime}>
      <ButtonComponent>hover here</ButtonComponent>
    </HoverHighlighter>
  );
  const rendered = getByText('hover here');
  expect(rendered).toBeTruthy();

  act(() => {
    fireEvent.mouseOver(rendered);
  });

  const highlightBubble = await findByText('input/button');
  expect(highlightBubble).toBeTruthy();
});

it('should hide the highlight when hovering out', async () => {
  const { getByText, findByText, queryByText } = render(
    <HoverHighlighter debounceSelection={debounceTime}>
      <ButtonComponent>hover here</ButtonComponent>
    </HoverHighlighter>
  );
  const rendered = getByText('hover here');
  expect(rendered).toBeTruthy();

  act(() => {
    fireEvent.mouseOver(rendered);
  });

  const highlightBubble = await findByText('input/button');
  expect(highlightBubble).toBeTruthy();

  act(() => {
    fireEvent.mouseOut(rendered);
  });
  await waitForElementToBeRemoved(() => queryByText('input/button'));
});

it('should keep the highlighter when hovering on it (even when moving out of the component zone', async () => {
  const { getByText, findByText } = render(
    <HoverHighlighter debounceSelection={debounceTime}>
      <ButtonComponent>hover here</ButtonComponent>
    </HoverHighlighter>
  );
  const rendered = getByText('hover here');
  expect(rendered).toBeTruthy();

  act(() => {
    // hover on target element:
    fireEvent.mouseOver(rendered);
  });

  const highlightBubble = await findByText('input/button');
  expect(highlightBubble).toBeTruthy();

  await act(async () => {
    // move mouse out of target element, "towards" the highlighter bubble
    fireEvent.mouseOut(rendered);

    // move mouse into the highlighter bubble
    fireEvent.mouseEnter(highlightBubble);
    // allow react to update state during the act()
    // and before verify highlighter remains
    await new Promise((resolve) => setTimeout(resolve, debounceTime + 10));
  });

  // highlighter should still focus the target button
  expect(await findByText('input/button')).toBeTruthy();
});
