import React from 'react';
import classnames from 'classnames';
import Button, { ButtonProps } from '@teambit/base-ui.input.button';
import { Icon } from '@teambit/evangelist.elements.icon';

import styles from './option-button.module.scss';

// consider using radio-button/checkbox (@teambit/base-ui.input.checkbox.label) instead of button element

export interface OptionButtonProps extends ButtonProps {
  active?: boolean;
  icon?: string;
}

export function OptionButton({ icon, className, active, children, ...rest }: OptionButtonProps) {
  const iconNode = icon ? <Icon of={icon} /> : null;

  return (
    <Button {...rest} className={classnames(className, styles.optionButton, active && styles.active)}>
      {iconNode}
      {children}
    </Button>
  );
}
