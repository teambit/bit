import React, { HTMLAttributes, useState, useRef } from 'react';
import classNames from 'classnames';
import styles from './preview-mask.module.scss';

export type PreviewMaskProps = {
  onMaskClicked: (pos: PreviewMaskPosition) => void;
} & HTMLAttributes<HTMLDivElement>;

export type PreviewMaskPosition = {
  x: string;
  y: string;
};

export function PreviewMask({ className, children, onMaskClicked, ...rest }: PreviewMaskProps) {
  const [position, setPosition] = useState<PreviewMaskPosition>({ x: `-100px`, y: `-100px` });
  const parentRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const { x, y } = parentRef?.current?.getBoundingClientRect() || { x: 0, y: 0 };
    const parentWidth = parentRef?.current?.clientWidth || 0;
    const parentHeight = parentRef?.current?.clientHeight || 0;

    const { clientX, clientY } = e;
    const xInPercent = Number(Math.abs((clientX - x) / parentWidth) * 100).toFixed(4);
    const yInPercent = Number(Math.abs((clientY - y) / parentHeight) * 100).toFixed(4);

    setPosition({ x: `${xInPercent}%`, y: `${yInPercent}%` });
    onMaskClicked(position);
  };

  return (
    <div {...rest} ref={parentRef} onClick={handleClick} className={classNames(styles.previewMaskContainer, className)}>
      <div style={{ top: position.y, left: position.x }} className={styles.position} />
      {children}
    </div>
  );
}
