import React from 'react';
import { VersionBlock } from '../../stage-components/workspace-sections/version-block';
import { Version } from '../../stage-components/workspace-page/change-log.data';

// @graphqlConnector()
export function ChangeLogPage({ versions }: { versions?: Version[] }) {
  if (!versions) return <div>No tags yet</div>;

  return (
    <div>
      {versions.map((version, index) => (
        <VersionBlock key={index} version={version} />
      ))}
    </div>
  );
}
