import React from 'react';
import { ScopeID } from '@teambit/scopes.scope-id';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { ComponentID } from '@teambit/component-id';
import styles from './component-card.module.scss';

export type ScopeIdentifier = {
  icon?: string;
  backgroundIconColor?: string;
  id: ScopeID;
};

export const defaultPlugins = [
  {
    preview: ({ component }) => {
      // TODO: replace with preview plugin after merging bit cloud lane.
      const env = component.get('teambit.envs/envs')?.data;
      const envComponentId = env?.id ? ComponentID.fromString(env?.id) : undefined;
      const baseUrl = 'https://preview.bit.cloud/api';
      const url = `/${envComponentId?.toString()}/~aspect/env-template/compositions/?compId=${component.id.toString()}#${component.id.toString()}?preview=compositions&viewport=1280`;
      return <iframe scrolling="no" className={styles.defaultPreview} src={`${baseUrl}${url}`} />;
    },
    previewBottomRight: ({ component }) => {
      const env = component.get('teambit.envs/envs')?.data;
      const envComponentId = env?.id ? ComponentID.fromString(env?.id) : undefined;
      return (
        <div>
          <div className={styles.badge}>
            <Tooltip delay={300} content={envComponentId?.name}>
              <img src={env?.icon} className={styles.envIcon} />
            </Tooltip>
          </div>
        </div>
      );
    },
  },
];
