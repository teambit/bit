import React from 'react';
import copy from 'copy-to-clipboard';
import classNames from 'classnames';
import { Icon } from '@bit/bit.evangelist.elements.icon';
import styles from './copy-box.module.scss';

export type CopyBoxProps = { children: string } & React.HTMLAttributes<HTMLDivElement>;

export function CopyBox({ children, className, ...rest }: CopyBoxProps) {
  const handleClick = () => {
    copy(children);
  };

  return (
    <div className={classNames(styles.copyBox, className)} {...rest}>
      <div>{children}</div>
      <button onClick={handleClick}>
        <Icon of="copy-cmp" />
      </button>
    </div>
  );
}
