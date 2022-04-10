import React, { ComponentType } from 'react';
import compact from 'lodash.compact';
import { ComponentModel } from '@teambit/component';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { EnvIcon } from '@teambit/envs.ui.env-icon';
import classnames from 'classnames';

import styles from './component-result.module.scss';

export type ComponentPluginProps = React.HTMLAttributes<HTMLDivElement> & { component: ComponentModel };

export type ComponentResultPlugin = {
  key: string;
  start?: ComponentType<ComponentPluginProps>;
  end?: ComponentType<ComponentPluginProps>;
};
type ComponentResultProps = {
  component: ComponentModel;
  plugins?: ComponentResultPlugin[];
};

export function ComponentResult({ component, plugins }: ComponentResultProps) {
  const name = component.id.fullName;

  const startPlugins = compact(
    plugins?.map((plugin) => plugin.start && <plugin.start key={plugin.key} component={component} />)
  );
  const endPlugins = compact(
    plugins?.map((plugin) => plugin.end && <plugin.end key={plugin.key} component={component} />)
  );

  return (
    <>
      {startPlugins}
      <EnvIcon component={component} className={styles.icon} />
      <div className={classnames(styles.name, ellipsis)}>{name}</div>
      {endPlugins}
    </>
  );
}
