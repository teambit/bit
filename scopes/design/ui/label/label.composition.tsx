import React, { useState } from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { Label, LabelList } from './label';

export function Single() {
  const [state, setState] = useState('');

  return (
    <ThemeCompositions>
      <Label onPick={setState}>chart</Label>
      {state && <div>label "{state}" chosen</div>}
    </ThemeCompositions>
  );
}

export function List() {
  const [state, setState] = useState('');

  return (
    <ThemeCompositions>
      <LabelList onPick={setState}>{['chart', 'graph', 'ui-component', 'react']}</LabelList>
      {state && <div>label "{state}" chosen</div>}
    </ThemeCompositions>
  );
}
