import React from 'react';
import { Transition } from 'react-transition-group';
import classnames from 'classnames';
import { Button, ButtonProps } from '@teambit/evangelist.elements.button';
import styles from './dismiss-button.module.scss';

type DismissButtonProps = { visible: boolean } & ButtonProps;

export function DismissButton({ visible, className, ...rest }: DismissButtonProps) {
  return (
    <Transition in={visible} timeout={+styles.animationTime}>
      {(state) => (
        <Button {...rest} className={classnames(className, styles.dismissButton, `${styles.dismissButton}-${state}`)}>
          Dismiss all
        </Button>
      )}
    </Transition>
  );
}
