import React from 'react';
import { render } from '@testing-library/react';
import { CommandBar } from './command-bar';
// import { useSearcher } from './command-bar/use-searcher';

describe('focus', () => {
  it('should focus when autofocused', () => {
    const { getByPlaceholderText } = render(<CommandBar autofocus placeholder="test target" items={[]} />);

    const focusedElement = document.activeElement;
    const target = getByPlaceholderText('test target');

    expect(target).toBe(focusedElement);
  });

  it('should not focus when no autofocused', () => {
    const { getByPlaceholderText } = render(<CommandBar placeholder="test target" items={[]} />);

    const focusedElement = document.activeElement;
    const target = getByPlaceholderText('test target');

    expect(target).not.toBe(focusedElement);
  });

  it('should focus when component becomes visible, when auto focus is enabled', () => {
    const { getByPlaceholderText, rerender } = render(
      <CommandBar autofocus visible={false} placeholder="test target" items={[]} />
    );
    // sanity
    expect(document.activeElement).not.toHaveProperty('placeholder', 'test target');

    rerender(<CommandBar autofocus visible={true} placeholder="test target" items={[]} />);

    expect(document.activeElement).toBe(getByPlaceholderText('test target'));
  });

  it('should not focus when component becomes visible, when auto focus is disabled', () => {
    const { getByPlaceholderText, rerender } = render(
      <CommandBar visible={false} placeholder="test target" items={[]} />
    );
    // sanity
    expect(document.activeElement).not.toHaveProperty('placeholder', 'test target');

    rerender(<CommandBar visible={true} placeholder="test target" items={[]} />);

    expect(document.activeElement).not.toBe(getByPlaceholderText('test target'));
  });

  // make sure we don't miss something when the component disappears and then re-appears
  it('should focus when switching between visible to non visible to visible, when autofocus is enabled', () => {
    const { getByPlaceholderText, rerender } = render(
      <>
        <CommandBar autofocus placeholder="test target" items={[]} />
        <input placeholder="another element" />
      </>
    );

    // ensure something else is focused
    getByPlaceholderText('another element').focus();
    expect(getByPlaceholderText('test target')).not.toBe(document.activeElement);

    rerender(
      <>
        <CommandBar autofocus visible={false} placeholder="test target" items={[]} />
        <input placeholder="another element" />
      </>
    );
    // sanity
    expect(getByPlaceholderText('test target')).not.toBe(document.activeElement);

    // make visible again
    rerender(
      <>
        <CommandBar autofocus visible placeholder="test target" items={[]} />
        <input placeholder="another element" />
      </>
    );

    expect(getByPlaceholderText('test target')).toBe(document.activeElement);
  });
});

// function MockedCommandBar(props: Partial<CommandBarProps>) {
//   const results = useSearcher(MockSearcher);

//   return <CommandBar {...results} {...props} />;
// }

// function MockSearcher() {
//   return [];
// }
