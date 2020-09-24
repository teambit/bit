// import { ComponentComposition } from '@teambit/compositions';
import ReactTooltip from 'react-tooltip';
import { ComponentCard } from '@teambit/explorer.ui.component-card';
import { ComponentGrid } from '@teambit/explorer.ui.component-grid';
import { Icon } from '@teambit/evangelist.elements.icon';
import React, { useContext } from 'react';

import { WorkspaceContext } from '../workspace-context';
import styles from './workspace-overview.module.scss';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { components } = workspace;

  return (
    <div className={styles.container}>
      <ComponentGrid>
        {components.map((component, index) => {
          return (
            <div key={index}>
              <ComponentCard
                id={component.id.fullName}
                envIcon={component.environment?.icon}
                preview={<PreviewPlaceholder name={component.id.toString()} />}
              />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}

function PreviewPlaceholder({ name }: { name?: string }) {
  return (
    <div className={styles.previewPlaceholder} data-tip="" data-for={name}>
      <Icon of="img" />
      <div>No preview available</div>
      <ReactTooltip className={styles.tooltip} place="bottom" id={name} effect="solid">
        Preview is generated from compositions during CI
      </ReactTooltip>
    </div>
  );
}
