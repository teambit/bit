import React, { useState, HTMLAttributes } from 'react';
import classNames from 'classnames';
import styles from './accordion.module.scss';

type AccordionProps = {
  anchor: React.ReactNode;
  children: JSX.Element;
} & HTMLAttributes<HTMLDivElement>;

export function Accordion({ anchor, children, className }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isOpenStyle = isOpen ? 'open' : 'closed';
  return (
    <div>
      <div onClick={() => setIsOpen(!isOpen)}>{anchor}</div>
      <div className={classNames(styles[isOpenStyle], className)}>{children}</div>
    </div>
  );
}
