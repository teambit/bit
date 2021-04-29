import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { CompositionCard } from './composition-card';

export function Preview() {
  const CompositionWithButton = () => <button>ClickMe!</button>;

  return (
    <ThemeCompositions>
      <CompositionCard Composition={CompositionWithButton} name="CompositionWithButton" />
    </ThemeCompositions>
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
    <ThemeCompositions>
      <CompositionCard Composition={CompositionWithLotsOfText} name="CompositionWithLotsOfText" />
    </ThemeCompositions>
  );
}

export function CompositionCardWithLink() {
  const CompositionWithButton = () => <button>ClickMe!</button>;

  return (
    <ThemeCompositions>
      <CompositionCard Composition={CompositionWithButton} name="CompositionWithButton" link="https://bit.dev" />
    </ThemeCompositions>
  );
}
