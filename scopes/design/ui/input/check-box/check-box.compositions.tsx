import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';

import { CheckBox } from './check-box';

export const Uncontrolled = () => {
  return (
    <ThemeContext>
      <div>
        <CheckBox /> <span>Option</span>
      </div>
    </ThemeContext>
  );
};

export const Checked = () => {
  return (
    <ThemeContext>
      <div>
        <CheckBox defaultChecked /> <span>Option</span>
      </div>
    </ThemeContext>
  );
};

export const disabled = () => {
  return (
    <ThemeContext>
      <div>
        <CheckBox disabled /> <span>Option</span>
      </div>
    </ThemeContext>
  );
};

export const disabledChecked = () => {
  return (
    <ThemeContext>
      <div>
        <CheckBox disabled defaultChecked /> <span>Option</span>
      </div>
    </ThemeContext>
  );
};

export const CheckedLarge = () => {
  return (
    <ThemeContext>
      <div style={{ fontSize: 46 }}>
        <CheckBox defaultChecked /> <span>Option</span>
      </div>
    </ThemeContext>
  );
};

export const CheckedSmall = () => {
  return (
    <ThemeContext>
      <div style={{ fontSize: 12 }}>
        <CheckBox defaultChecked /> <span>12px</span>
      </div>
    </ThemeContext>
  );
};

export const CheckedExtraSmall = () => {
  return (
    <ThemeContext>
      <div style={{ fontSize: 8 }}>
        <CheckBox defaultChecked /> <span>8px</span>
      </div>
    </ThemeContext>
  );
};
