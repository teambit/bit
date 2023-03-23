import React, { ReactNode, useState, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { Tab } from './tab';
import styles from './toggle-button.module.scss';

export type Option = {
  value: string;
  element: ReactNode;
  icon?: ReactNode;
};

export type ToggleButtonProps = {
  /**
   * The option that should be active on initial render.
   */
  defaultIndex?: number;
  /**
   * An array of options to render.
   */
  options: Option[];
  /**
   * A callback function that is triggered on options click.
   */
  onOptionSelect?: (selectedOption: number, e?: React.MouseEvent<HTMLDivElement>) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function ToggleButton({ defaultIndex = 0, options, onOptionSelect, className, ...rest }: ToggleButtonProps) {
  const [selectedTab, setSelectedTab] = useState<HTMLDivElement | undefined>(undefined);
  const [tabIndex, setTabIndex] = useState(defaultIndex);
  const [enableAnimation, setEnableAnimation] = useState(false);
  const tabRefs = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    setTimeout(() => {
      setSelectedTab(tabRefs.current[defaultIndex]);
      setEnableAnimation(true);
    }, 500);
  }, []);

  const onTabSelect = (index: number, e?: React.MouseEvent<HTMLDivElement>) => {
    setTabIndex(index);
    setSelectedTab(tabRefs.current[index]);
    onOptionSelect && onOptionSelect(index, e);
  };

  return (
    <div className={classNames(styles.toggleButton, className)} {...rest}>
      {options.map((item, index) => (
        <div
          key={`${item.value}-${index}`}
          className={classNames(
            styles.option,
            index === tabIndex && styles.active,
            index === tabIndex && !enableAnimation && styles.noAnimation
          )}
          ref={(ref) => ref && (tabRefs.current[index] = ref)}
          onClick={(e) => onTabSelect(index, e)}
        >
          {item.icon}
          {item.element}
        </div>
      ))}
      <Tab selectedTab={selectedTab} enableAnimation={enableAnimation} />
    </div>
  );
}
