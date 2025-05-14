// TODO: replace this with a better-implemented live control component set

import React from 'react';
import { type Control } from './live-control.type';

export type InputProps = {
  id: string;
  value: any;
  onChange: (v: any) => void;
  info: Control;
};

function InputText(inputProps: InputProps) {
  const { id, value, onChange } = inputProps;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return <input id={id} type="text" value={value} onChange={handleChange} />;
}

function InputNumber(inputProps: InputProps) {
  const { id, value, onChange } = inputProps;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };
  return <input id={id} type="number" value={value} onChange={handleChange} />;
}

function InputBoolean(inputProps: InputProps) {
  const { id, value, onChange } = inputProps;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };
  return <input id={id} type="checkbox" checked={value} onChange={handleChange} />;
}

export function getInputType(field: Control): React.ComponentType<InputProps> {
  switch (field.input) {
    case 'text':
      return InputText;
    case 'number':
      return InputNumber;
    case 'boolean':
      return InputBoolean;
    default:
      return InputText;
  }
}

export function LiveControls({
  defs,
  values,
  onChange,
}: {
  defs: Array<Control>;
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  return (
    <div>
      <div>Controls</div>
      <div>
        {defs.map((field) => {
          const key = field.id;
          const Input = getInputType(field);
          return (
            <div key={key}>
              <div>
                <label htmlFor={`control-${key}`}>{field.label || field.id}</label>
              </div>
              <div>
                <Input id={`control-${key}`} value={values[key]} onChange={(v: any) => onChange(key, v)} info={field} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
