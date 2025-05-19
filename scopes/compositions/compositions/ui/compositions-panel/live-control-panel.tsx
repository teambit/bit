// TODO: replace this with a better-implemented live control component set

import React from 'react';
import { Control } from './live-control.type';
import { getInputComponent } from './live-control-input';

export function LiveControls({
  defs,
  values,
  onChange,
}: {
  defs: Array<Control>;
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  // eslint-disable-next-line no-console
  console.log('LiveControls', defs, values);
  return (
    <div>
      {defs.map((field) => {
        const key = field.id;
        const InputComponent = getInputComponent(field.input || 'text');
        return (
          <div key={key}>
            <div>
              <label htmlFor={`control-${key}`}>{field.label || field.id}</label>
            </div>
            <div>
              <InputComponent
                id={`control-${key}`}
                value={values[key]}
                onChange={(v: any) => onChange(key, v)}
                meta={field}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
