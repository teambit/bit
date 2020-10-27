import classnames from 'classnames';
import React from 'react';

import styles from './label.module.scss';

type LabelProps = {
  onPick?: (label: string) => any;
  children: string;
} & React.InputHTMLAttributes<HTMLDivElement>;

type LabelListProps = {
  onPick?: (label: string) => any;
  children?: string[];
} & React.InputHTMLAttributes<HTMLDivElement>;

export function Label({ onPick, onClick, className, ...rest }: LabelProps) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    onPick && onPick(rest.children);
    return onClick && onClick(e);
  };

  return <div {...rest} onClick={handleClick} className={classnames(className, styles.label)} />;
}

export function LabelList(props: LabelListProps) {
  const { children, className, onPick, ...rest } = props;

  return (
    <div {...rest} className={classnames(className, styles.labelList)}>
      {children &&
        children.map((x) => (
          <Label key={x} onPick={onPick}>
            {x}
          </Label>
        ))}
    </div>
  );
}
