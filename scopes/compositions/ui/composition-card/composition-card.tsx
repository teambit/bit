import React, { useMemo } from 'react';
import classNames from 'classnames';
import { humanizeCompositionId } from '@teambit/model.composition-id';
import { CompositionType } from '@teambit/model.composition-type';
import { Card } from '@teambit/base-ui.surfaces.card';
import { colorPalette } from '@teambit/base-ui.theme.color-palette';
import { themedText } from '@teambit/base-ui.text.themed-text';
import styles from './composition-card.module.scss';

export type CompositionCardProps = {
  Composition: CompositionType;
  name: string;
};

export function CompositionCard({ Composition, name }: CompositionCardProps) {
  const { canvas } = Composition;

  const humanizedName = useMemo(() => humanizeCompositionId(name), [name]);

  return (
    <Card elevation="low" className={classNames(styles.compositionCard)}>
      <div style={canvas} className={styles.compositionContainer}>
        <Composition />
      </div>
      <div className={classNames(styles.title, colorPalette.emphasized, themedText)}>{humanizedName}</div>
    </Card>
  );
}
