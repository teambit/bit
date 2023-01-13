import React, { HTMLAttributes, useState, useEffect, forwardRef } from 'react';
import classNames from 'classnames';
import styles from './tab-line.module.scss';

export type BorderPosition = 'top' | 'bottom';

export type TabLineProps = {
  selectedTab?: HTMLElement;
  borderPosition?: BorderPosition;
} & HTMLAttributes<HTMLDivElement>;

type BorderStyle = {
  width: undefined | string;
  transform: undefined | string;
};

export const TabLine = forwardRef<HTMLDivElement, TabLineProps>(
  ({ selectedTab, borderPosition, className, ...rest }: TabLineProps, ref) => {
    const [borderStyles, setBorderStyle] = useState<BorderStyle>({ width: undefined, transform: undefined });

    useEffect(() => {
      if (selectedTab) {
        const styleObj: BorderStyle = { width: undefined, transform: undefined };
        const offset = selectedTab.offsetLeft;

        styleObj.width = `${selectedTab.offsetWidth}px`;
        styleObj.transform = `translateX(${offset}px)`;

        setBorderStyle(styleObj);
      }
    }, [selectedTab]);

    return (
      <div
        data-position={borderPosition}
        className={classNames(styles.tabLine, className)}
        style={borderStyles}
        ref={ref}
        {...rest}
      />
    );
  }
);
