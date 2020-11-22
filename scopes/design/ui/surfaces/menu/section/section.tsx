import React, { ComponentType } from 'react';
import styles from './section.module.scss';

export type MenuSectionProps = {
  links: ComponentType[];
} & React.HTMLAttributes<HTMLDivElement>;

export function MenuSection({ links, ...rest }: MenuSectionProps) {
  if (!links || links.length === 0) return null;

  return (
    <div {...rest} className={styles.menuSection}>
      {links.map((link, index) => {
        const Link = link;
        return <Link key={index} />;
      })}
    </div>
  );
}
