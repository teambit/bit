import { ComponentModel } from '@teambit/component';
import classNames from 'classnames';
import React, { useCallback, useEffect } from 'react';

import { Composition } from '../../composition';
import { CompositionCard } from '@teambit/composition-card';
import styles from './compositions-panel.module.scss';

export type CompositionsPanelProps = {
  /**
   * list of compositions
   */
  compositions: Composition[];
  /**
   * list of compositions
   */
  component: ComponentModel;
  /**
   * select composition to display
   */
  onSelectComposition: (composition: Composition) => void;
  /**
   * the currently active composition
   */
  active?: Composition;
  /**
   * the url to the base composition. doesntc contain the current composition params
   */
  url: string;
  /**
   * checks if a component is using the new preview api. if false, doesnt scale to support new preview
   */
  isScaling?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function CompositionsPanel({
  url,
  compositions,
  component,
  isScaling,
  onSelectComposition: onSelect,
  active,
  className,
  ...rest
}: CompositionsPanelProps) {
  const handleSelect = useCallback(
    (selected: Composition) => {
      onSelect && onSelect(selected);
    },
    [onSelect]
  );

  useEffect(() => {
    // first load should scroll down to show the active card in the fold.
    active?.identifier && document.getElementById(active?.identifier)?.scrollIntoView({block: 'center'});
  }, []);

  return (
    <div {...rest} className={classNames(styles.compositionGrid, className)}>
      {compositions.map((composition) => {
        const href = isScaling ? `${url}&name=${composition.identifier}` : `${url}&${composition.identifier}`;

        // TODO - move to composition panel node
        return (
          <CompositionCard
            key={composition.identifier}
            id={composition.identifier}
            onClick={() => handleSelect(composition)}
            openCompositionLink={href}
            className={classNames(styles.compositionCard, composition === active && styles.active)}
            previewClass={styles.preview}
            composition={composition}
            component={component}
          />
        );
      })}
    </div>
  );
}
