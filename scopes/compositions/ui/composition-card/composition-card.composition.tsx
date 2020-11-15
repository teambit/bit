import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { CompositionCard } from './composition-card';

export function Preview() {
  const CompositionWithButton = () => <button>ClickMe!</button>;

  return (
    <ThemeContext>
      <CompositionCard Composition={CompositionWithButton} name="CompositionWithButton" />
    </ThemeContext>
  );
}

export function LargeComposition() {
  const CompositionWithLotsOfText = () => (
    <div>
      Lorem ipsum dolor sit amet,
      <br />
      consectetur adipiscing elit.
      <br />
      Etiam sed neque congue,
      <br />
      bibendum neque a, faucibus nibh.
    </div>
  );

  return (
    <ThemeContext>
      <CompositionCard Composition={CompositionWithLotsOfText} name="CompositionWithLotsOfText" />
    </ThemeContext>
  );
}
