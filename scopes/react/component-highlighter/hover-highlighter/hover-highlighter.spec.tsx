import React, { ReactNode } from 'react';
import { act } from 'react-dom/test-utils';
import { render, fireEvent, waitForElementToBeRemoved } from '@testing-library/react';
import { ComponentMeta, componentMetaField } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import { HoverHighlighter } from './hover-highlighter';

const debounceTime = 2;

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
  expect(highlightBubble).toBeInstanceOf(HTMLElement);
});

it('should hide the highlight when hovering out of the element', async () => {
  const { getByText, findByText, queryByText } = render(
    <HoverHighlighter debounceSelection={debounceTime}>
      <ButtonComponent>hover here</ButtonComponent>
    </HoverHighlighter>
  );
  const rendered = getByText('hover here');

  act(() => {
    fireEvent.mouseOver(rendered);
  });

  const highlightBubble = await findByText('input/button');
  expect(highlightBubble).toBeInstanceOf(HTMLElement);

  act(() => {
    fireEvent.mouseOut(rendered);
  });
  await waitForElementToBeRemoved(() => queryByText('input/button'));
});

it('should keep the highlighter, when hovering on it (even when moving out of the component zone)', async () => {
  const { getByText, findByText } = render(
    <HoverHighlighter debounceSelection={debounceTime}>
      <ButtonComponent>hover here</ButtonComponent>
    </HoverHighlighter>
  );
  const rendered = getByText('hover here');

  act(() => {
    // hover on target element:
    fireEvent.mouseOver(rendered);
  });

  const highlightBubble = await findByText('input/button');

  await act(async () => {
    // move mouse out of target element, "towards" the highlighter bubble
    // this should trigger hiding
    fireEvent.mouseOut(rendered);

    // move mouse into the highlighter bubble
    fireEvent.mouseEnter(highlightBubble);
    // allow react to update state during the act()
    // and before verifying highlighter remains
    await new Promise((resolve) => setTimeout(resolve, debounceTime + 10));
  });

  // highlighter should still focus the target button
  expect(await findByText('input/button')).toBeInstanceOf(HTMLElement);
});

it('should hide the highlighter when moving the mouse away of it', async () => {
  const { getByText, queryByText, findByText } = render(
    <HoverHighlighter debounceSelection={debounceTime}>
      <ButtonComponent>hover here</ButtonComponent>
    </HoverHighlighter>
  );

  const rendered = getByText('hover here');

  // hover on target element:
  await act(async () => {
    fireEvent.mouseOver(rendered);
  });

  const highlightBubble = await findByText('input/button');

  await act(async () => {
    // hover on highlighter
    fireEvent.mouseEnter(highlightBubble);
    // leave the highlighter
    fireEvent.mouseOut(highlightBubble);
    await new Promise((resolve) => setTimeout(resolve, debounceTime + 10));
  });

  // highlighter sometimes disappears before this check,
  // so not using waitForElementToBeRemoved, and using setTimeout instead
  expect(queryByText('input/button')).toBeNull();
});
