import React, { ComponentType } from 'react';
import styles from './section.module.scss';

export type MenuSectionProps = {
  items: ComponentType[];
} & React.HTMLAttributes<HTMLDivElement>;

export function MenuSection({ items, ...rest }: MenuSectionProps) {
  if (!items || items.length === 0) return null;

  return (
    <div {...rest} className={styles.menuSection}>
      {items.map((item, index) => {
        const Item = item;
        return <Item key={index} />;
      })}
    </div>
  );
}
