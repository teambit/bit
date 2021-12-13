import React from 'react';
import classnames from 'classnames';
import { ComponentMetaHolder } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { Frame } from '../frame';
import { Label, LabelContainer, Placement } from '../label';
import { excludeHighlighterAtt } from '../ignore-highlighter';
import styles from './element-highlighter.module.scss';

export interface ElementHighlighterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** target element to highlight */
  target: HighlightTarget;
  /** default location of the label */
  placement?: Placement;
  /** customize styles */
  classes?: HighlightClasses;
  /** continually update highlighter to match moving elements */
  watchMotion?: boolean;
}

export { Placement };

export type HighlightTarget = {
  /** element to show the highlight at */
  element: HTMLElement;
  /** components with metadata to show in the label */
  components?: ComponentMetaHolder[];
};

export type HighlightClasses = {
  container?: string;
  frame?: string;
  label?: string;
};

export function ElementHighlighter({
  target,
  placement = 'top',
  watchMotion = true,
  className,
  classes,
  ...props
}: ElementHighlighterProps) {
  return (
    <div {...props} {...excludeHighlighterAtt} className={classnames(classes?.container, styles.container, className)}>
      <Frame
        targetRef={target.element}
        className={classnames(styles.frame, classes?.frame)}
        watchMotion={watchMotion}
      />

      {target.components && (
        <LabelContainer
          className={styles.label}
          targetRef={target.element}
          placement={placement}
          watchMotion={watchMotion}
        >
          <Label components={target.components} className={classes?.label} />
        </LabelContainer>
      )}
    </div>
  );
}
