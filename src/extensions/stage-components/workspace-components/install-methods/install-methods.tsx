import React from 'react';
import classNames from 'classnames';
import { PossibleSizes } from '@teambit/base-ui-temp.theme.sizes';
import { Grid } from '@teambit/base-ui-temp.layout.grid-component';
import { H5 } from '@teambit/evangelist-temp.elements.heading';
import { CopyBox } from '../copy-box';
import styles from './install-methods.module.scss';

export type InstallMethodsData = {
  title: string;
  content: string;
};

export type InstallMethodsProps = {
  data: InstallMethodsData[];
} & React.HTMLAttributes<HTMLDivElement>;

export function InstallMethods({ data, className }: InstallMethodsProps) {
  return (
    <Grid colMd={2} className={classNames(styles.copyMethod, className)}>
      {data.map((method, key) => (
        <div key={key}>
          <H5 className={styles.copyTitle} size={PossibleSizes.xxs}>
            {method.title}
          </H5>
          <CopyBox className={styles.copyBox}>{method.content}</CopyBox>
        </div>
      ))}
    </Grid>
  );
}
