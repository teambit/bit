import React from 'react';
import classNames from 'classnames';
import { Label } from '@teambit/base-ui.elements.label';
import { Paragraph } from '@teambit/base-ui.text.paragraph';
import { mutedText } from '@teambit/base-ui.text.muted-text';
import { Card } from '@teambit/base-ui.surfaces.card';
import styles from './scope-card.module.scss';

export type ScopeCardProps = {
  /**
   * scope name
   */
  name: string;
  /**
   * scope description
   */
  description: string;
  /**
   * amount of components in scope
   */
  amount: string;
} & React.HTMLAttributes<HTMLDivElement>;

export const ScopeCard = ({ name, description, amount, className, ...rest }: ScopeCardProps) => {
  return (
    <Card className={classNames(styles.scopeCard, className)} {...rest}>
      <div className={classNames(styles.textHolder)}>
        <Paragraph element="span" className={styles.scopeName}>
          {name}
        </Paragraph>
        <Paragraph element="span" className={classNames(styles.scopeDescription, mutedText)}>
          {description}
        </Paragraph>
      </div>
      <Label>{amount}</Label>
    </Card>
  );
};
