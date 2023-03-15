import React, { HTMLAttributes, useState, useEffect, forwardRef } from 'react';
import classNames from 'classnames';
import styles from './tab.module.scss';

export type TabProps = {
  selectedTab?: HTMLElement;
} & HTMLAttributes<HTMLDivElement>;

type BorderStyle = {
  width: undefined | string;
  transform: undefined | string;
};

export const Tab = forwardRef<HTMLDivElement, TabProps>(({ selectedTab, className, ...rest }: TabProps, ref) => {
  const [borderStyles, setBorderStyle] = useState<BorderStyle>({
    width: undefined,
    transform: undefined,
  });

  useEffect(() => {
    if (selectedTab) {
      const styleObj: BorderStyle = {
        width: undefined,
        transform: undefined,
      };
      const offset = selectedTab.offsetLeft;

      styleObj.width = `${selectedTab.offsetWidth}px`;
      styleObj.transform = `translateX(${offset}px)`;

      setBorderStyle(styleObj);
    }
  }, [selectedTab]);

  return <div className={classNames(styles.tab, className)} style={borderStyles} ref={ref} {...rest} />;
});
