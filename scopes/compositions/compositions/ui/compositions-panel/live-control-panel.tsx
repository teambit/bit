// TODO: replace this with a better-implemented live control component set

import React from 'react';
import classNames from 'classnames';
import styles from './live-control-panel.module.scss';
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
  return (
    <ul className={classNames(styles.container)}>
      {defs.map((field) => {
        const key = field.id;
        const InputComponent = getInputComponent(field.input || 'text');
        return (
          <li key={key} className={classNames(styles.item)}>
            <div className={classNames(styles.label)}>
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
          </li>
        );
      })}
    </ul>
  );
}
