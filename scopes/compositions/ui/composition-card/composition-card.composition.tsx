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
      coding is the best.
      <br />
      don't let it make you feel dumb.
      <br />
      keep calm, debug on!
    </div>
  );

  return (
    <ThemeContext>
      <CompositionCard Composition={CompositionWithLotsOfText} name="CompositionWithLotsOfText" />
    </ThemeContext>
  );
}
