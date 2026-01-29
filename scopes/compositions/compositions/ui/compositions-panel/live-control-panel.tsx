import React from 'react';
import classNames from 'classnames';
import { type Control } from '@teambit/compositions.ui.composition-live-controls';

import styles from './live-control-panel.module.scss';
import { getInputComponent } from './live-control-input';

export function LiveControls({
  defs,
  values,
  onChange,
  renderLabel,
}: {
  defs: Array<Control>;
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  renderLabel?: (field: Control) => React.ReactNode;
}) {
  return (
    <ul className={classNames(styles.container)}>
      {defs.map((field) => {
        const key = field.id;
        const InputComponent = getInputComponent(field.input || 'text');
        const labelContent = renderLabel ? renderLabel(field) : field.label || field.id;
        return (
          <li key={key} className={classNames(styles.item)}>
            <div className={classNames(styles.label)}>
              <label htmlFor={`control-${key}`}>{labelContent}</label>
            </div>
            <div>
              <InputComponent
                id={`control-${key}`}
                value={values[key]}
                onChange={(v: any) => onChange(key, v)}
                meta={field}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
