import React from 'react';
import classNames from 'classnames';
import { Heading } from '@teambit/base-ui.text.heading';
import { Paragraph } from '@teambit/base-ui.text.paragraph';
import { Avatar } from './avatar';
import styles from './hero.module.scss';

export type HeroProps = {
  /**
   * header title
   */
  title: string;
  /**
   * description title
   */
  description?: string;
  /**
   * user name
   */
  userName: string;
  /**
   * user profile image url
   */
  profileImage: string;
} & React.HTMLAttributes<HTMLDivElement>;

export const Hero = ({ title, description, userName, profileImage, className, ...rest }: HeroProps) => {
  return (
    <div className={classNames(styles.hero, className)} {...rest}>
      <Avatar src={profileImage} alt={`${userName} profile image`} />
      <div className={styles.heroDetails}>
        <Heading className={styles.title}>{title}</Heading>
        <Paragraph element="div" className={styles.description}>
          {description}
        </Paragraph>
      </div>
    </div>
  );
};
