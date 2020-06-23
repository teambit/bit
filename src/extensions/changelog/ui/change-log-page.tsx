import React, { HTMLAttributes } from 'react';
import { VersionBlock } from '../../stage-components/workspace-sections/version-block';
import { Version } from '../../stage-components/workspace-page/change-log.data';

type ChangeLogPageProps = {
  versions: Version[];
} & HTMLAttributes<HTMLDivElement>;

// @graphqlConnector()
export function ChangeLogPage({ versions, className }: ChangeLogPageProps) {
  if (!versions) return <div>No tags yet</div>;

  return (
    <div className={className}>
      {versions.map((version, index) => (
        <VersionBlock key={index} version={version} />
      ))}
    </div>
  );
}
