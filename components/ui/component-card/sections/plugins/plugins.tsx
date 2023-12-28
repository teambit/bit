import React, { ComponentType } from 'react';
import classNames from 'classnames';
import { ComponentID } from '@teambit/component-id';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { LaneId } from '@teambit/lane-id';
import styles from './plugins.module.scss';

export type PluginProps = {
  component: ComponentDescriptor;
};

export type ComponentCardPluginType<T> = {
  bottomLeft?: ComponentType<T>[];
  bottomRight?: ComponentType<T>[];
  preview?: ComponentType<any>;
  previewBottomLeft?: ComponentType<any>;
  previewBottomRight?: ComponentType<any>;
  leftOfName?: ComponentType[];
  topLeft?: ComponentType<T>[];
  topRight?: ComponentType<T>[];
  link?: (id: ComponentID, laneId?: LaneId) => string;
};

export type PluginRowProps = {
  plugins?: ComponentCardPluginType<PluginProps>[];
  component: ComponentDescriptor;
} & React.HTMLAttributes<HTMLDivElement>;

export function BottomPlugins({ plugins, component, className, ...rest }: PluginRowProps) {
  if (!plugins) return null;

  return (
    <div {...rest} className={classNames(styles.plugins, className)}>
      <div className={styles.left}>
        <PluginList component={component} plugins={plugins} position="bottomLeft" />
      </div>
      <div className={styles.right}>
        <PluginList component={component} plugins={plugins} position="bottomRight" />
      </div>
    </div>
  );
}

export function TopPlugins({ plugins, component, className, ...rest }: PluginRowProps) {
  if (!plugins) return null;

  return (
    <div {...rest} className={classNames(styles.plugins, styles.topPlugins, className)}>
      <div className={styles.left}>
        <PluginList component={component} plugins={plugins} position="topLeft" />
      </div>
      <div className={styles.right}>
        <PluginList component={component} plugins={plugins} position="topRight" />
      </div>
    </div>
  );
}

export type PluginListProps = {
  position: 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
} & PluginRowProps;

export function PluginList({ plugins, component, position, ...rest }: PluginListProps) {
  return (
    <>
      {plugins?.map((plugin) => {
        return plugin?.[position]?.map((Plugin, index) => {
          return <Plugin component={component} key={index} />;
        });
      })}
    </>
  );
}
