import React from 'react';
import classNames from 'classnames';
import { ScopeCard } from './scope-card';
import styles from './scopes-list.module.scss';

export const ScopeList = ({ list, className, ...rest }: any) => {
  return (
    <div className={classNames(styles.scopeList, className)} {...rest}>
      {list.length > 0 &&
        list.map((scope, index) => (
          <ScopeCard
            key={index}
            name={scope.id.toString()}
            description={scope.description}
            amount={scope.componentCount.toString()}
          />
        ))}
    </div>
  );
};
