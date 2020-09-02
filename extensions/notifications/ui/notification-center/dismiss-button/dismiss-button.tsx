import React from 'react';
import { Transition } from 'react-transition-group';
import classnames from 'classnames';
import { Button } from '@teambit/evangelist.elements.button';
import styles from './dismiss-button.module.scss';

export function DismissButton({ visible, onClick }: { visible: boolean; onClick: any }) {
  return (
    <Transition in={visible} timeout={+styles.animationTime}>
      {(state) => (
        <Button
          importance="normal"
          className={classnames(styles.dismissButton, `${styles.dismissButton}-${state}`)}
          onClick={onClick}
        >
          Dismiss all
        </Button>
      )}
    </Transition>
  );
}
