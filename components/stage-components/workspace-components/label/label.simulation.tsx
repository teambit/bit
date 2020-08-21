import React, { useState } from 'react';
import { Label, LabelList } from './label';

export function Single() {
  const [state, setState] = useState('');

  return (
    <div>
      <Label onPick={setState}>chart</Label>
      {state && <div>label "{state}" chosen</div>}
    </div>
  );
}

export function List() {
  const [state, setState] = useState('');

  return (
    <div>
      <LabelList onPick={setState}>{['chart', 'graph', 'ui-component', 'react']}</LabelList>
      {state && <div>label "{state}" chosen</div>}
    </div>
  );
}
