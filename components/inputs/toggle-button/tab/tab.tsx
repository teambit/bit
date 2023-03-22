import React, { HTMLAttributes, useState, useEffect, forwardRef } from 'react';
import classNames from 'classnames';
import styles from './tab.module.scss';

export type TabProps = {
  selectedTab?: HTMLElement;
  enableAnimation?: boolean;
} & HTMLAttributes<HTMLDivElement>;

type BorderStyle = {
  width: undefined | string;
  transform: undefined | string;
  transition: undefined | string;
};

export const Tab = forwardRef<HTMLDivElement, TabProps>(
  ({ selectedTab, enableAnimation = false, className, ...rest }: TabProps, ref) => {
    const [borderStyles, setBorderStyle] = useState<BorderStyle>({
      width: undefined,
      transform: undefined,
      transition: undefined,
    });

    useEffect(() => {
      if (selectedTab) {
        const styleObj: BorderStyle = {
          width: undefined,
          transform: undefined,
          transition: undefined,
        };

        styleObj.width = `${selectedTab.offsetWidth}px`;
        styleObj.transform = `translateX(${selectedTab.offsetLeft}px)`;
        if (enableAnimation) styleObj.transition = 'transform 150ms ease-in-out, width 150ms ease-in-out';

        setBorderStyle(styleObj);
      }
    }, [selectedTab, enableAnimation]);

    return <div className={classNames(styles.tab, className)} style={borderStyles} ref={ref} {...rest} />;
  }
);
