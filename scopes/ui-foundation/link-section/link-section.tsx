import React, { ComponentType } from 'react';
import styles from './link-section.module.scss';

export type link = ComponentType;

export type LinkSectionProps = {
  links: link[];
} & React.HTMLAttributes<HTMLDivElement>;

export function LinkSection({ links, ...rest }: LinkSectionProps) {
  if (!links || links.length === 0) return null;

  return (
    <div {...rest} className={styles.linkSection}>
      {links.map((link, index) => {
        const Link = link;
        return <Link key={index} />;
      })}
    </div>
  );
}
