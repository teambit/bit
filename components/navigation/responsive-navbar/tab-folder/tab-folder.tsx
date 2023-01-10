import React, { HTMLAttributes, useState, useEffect, forwardRef } from 'react';
import classNames from 'classnames';
import styles from './tab-folder.module.scss';

export type TabFolderProps = {
  selectedTab?: HTMLElement;
} & HTMLAttributes<HTMLDivElement>;

type BorderStyle = {
  width: undefined | string;
  transform: undefined | string;
};

export const TabFolder = forwardRef<HTMLDivElement, TabFolderProps>(
  ({ selectedTab, className, ...rest }: TabFolderProps, ref) => {
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

    return <div className={classNames(styles.tabFolder, className)} style={borderStyles} ref={ref} {...rest} />;
  }
);
