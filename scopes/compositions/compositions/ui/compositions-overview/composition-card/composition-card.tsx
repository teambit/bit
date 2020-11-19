import React, { useMemo, CSSProperties, ComponentType } from 'react';
import classNames from 'classnames';
import humanizeString from 'humanize-string';
import { Card } from '@teambit/base-ui.surfaces.card';
import { colorPalette } from '@teambit/base-ui.theme.color-palette';
import { themedText } from '@teambit/base-ui.text.themed-text';
import styles from './composition-card.module.scss';

type CompositionType<P = {}> = ComponentType<P> & {
  canvas?: CSSProperties;
};

export type CompositionCardProps = {
  Composition: CompositionType;
  name: string;
};

export function CompositionCard({ Composition, name }: CompositionCardProps) {
  const { canvas } = Composition;

  const humanizedName = useMemo(() => humanizeString(name), [name]);

  return (
    <Card elevation="low" className={classNames(styles.compositionCard)}>
      <div style={canvas} className={styles.compositionContainer}>
        <Composition />
      </div>
      <div className={classNames(styles.title, colorPalette.emphasized, themedText)}>{humanizedName}</div>
    </Card>
  );
}
