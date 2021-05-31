import React, { useMemo } from 'react';
import classNames from 'classnames';
import { humanizeCompositionId } from '@teambit/compositions.model.composition-id';
import { Icon } from '@teambit/evangelist.elements.icon';
import { CompositionType } from '@teambit/compositions.model.composition-type';
import { Card } from '@teambit/base-ui.surfaces.card';
import { colorPalette } from '@teambit/base-ui.theme.color-palette';
import { themedText } from '@teambit/base-ui.text.themed-text';
import styles from './composition-card.module.scss';

export type CompositionCardProps = {
  Composition: CompositionType;
  name: string;
  link?: string;
};

export function CompositionCard({ Composition, name, link }: CompositionCardProps) {
  const { canvas } = Composition;

  const humanizedName = useMemo(() => humanizeCompositionId(name), [name]);

  return (
    <Card elevation="low" className={classNames(styles.compositionCard)}>
      <div style={canvas} className={styles.compositionContainer}>
        <Composition />
      </div>
      <div className={classNames(styles.title, colorPalette.emphasized, themedText)}>
        <span>{humanizedName}</span>
        {link && (
          <a className={styles.linkToComposition} target="_blank" rel="noopener noreferrer" href={link}>
            <Icon of="open-tab" />
          </a>
        )}
      </div>
    </Card>
  );
}
