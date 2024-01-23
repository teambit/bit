import React from 'react';
import classnames from 'classnames';
import { Button, ButtonProps } from '@teambit/evangelist.elements.button';
import { useInOutTransition } from '@teambit/ui-foundation.ui.hooks.use-in-out-transition';
import styles from './dismiss-button.module.scss';

type DismissButtonProps = { visible: boolean } & ButtonProps;

export function DismissButton({ visible, className, ...rest }: DismissButtonProps) {
  const stage = useInOutTransition(visible, +styles.animationTime);

  return (
    <Button {...rest} className={classnames(className, styles.dismissButton, `${styles.dismissButton}-${stage}`)}>
      Dismiss all
    </Button>
  );
}
