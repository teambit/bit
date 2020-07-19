import React, { HTMLAttributes, useContext } from 'react';
import classNames from 'classnames';
import { H1 } from '@bit/bit.evangelist.elements.heading';
import { TagBlock } from '../../stage-components/workspace-sections/version-block';
import { Version } from '../../stage-components/workspace-page/change-log.data';
import { Separator } from '../../stage-components/workspace-components/separator';
import styles from './change-log-page.module.scss';
import { ComponentContext } from '../../component/ui';

type ChangeLogPageProps = {
  versions: Version[];
} & HTMLAttributes<HTMLDivElement>;

// @graphqlConnector()
export function ChangeLogPage({ versions, className }: ChangeLogPageProps) {
  const component = useContext(ComponentContext);
  if (!versions) return <div>No tags yet</div>;
  const tags = component.tags.toArray();

  return (
    <div className={classNames(styles.changeLogPage, className)}>
      <H1 className={styles.title}>History</H1>
      <Separator />
      {tags.reverse().map((tag, index) => (
        <TagBlock key={index} tag={tag} />
      ))}
    </div>
  );
}
