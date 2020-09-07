import { ConsumableLink } from '@teambit/documenter.ui.consumable-link';
import { Subtitle } from '@teambit/documenter.ui.sub-title';
import { ScopeLabels } from '@teambit/staged-components.scope-labels';
import { ScopeTitle } from '@teambit/staged-components.scope-title';
import { AccountObj, UserAvatar } from '@teambit/staged-components.workspace-components.avatar';
import classNames from 'classnames';
import React from 'react';

import styles from './scope-details.module.scss';

type ScopeDetailsProps = {
  owner: string;
  scopeName: string;
  visibility: string;
  license: string;
  description: string;
  contributors: AccountObj[];
} & React.HTMLAttributes<HTMLDivElement>;

export function ScopeDetails({
  owner,
  scopeName,
  visibility,
  license,
  description,
  contributors,
  className,
  ...rest
}: ScopeDetailsProps) {
  return (
    <div {...rest} className={classNames(styles.scopeTitle, className)}>
      <div className={styles.titleRow}>
        <ScopeTitle owner={owner} scopeName={scopeName} />
        <ScopeLabels visibility={visibility} license={license} />
      </div>
      <Subtitle>{description}</Subtitle>
      <div className={styles.contributors}>
        {contributors.map((user, index) => {
          return <UserAvatar key={index} size={32} account={user} className={styles.avatar} />;
        })}
      </div>
      <ConsumableLink
        title="Export to this scope"
        link={`bit export ${owner}.${scopeName}`}
        className={styles.copyLink}
      />
    </div>
  );
}
