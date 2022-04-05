import React, { RefObject } from 'react';
import classnames from 'classnames';
import { ComponentMetaHolder } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { Frame } from '../frame';
import { Label, LabelContainer, Placement } from '../label';
import { skipHighlighterAttr } from '../ignore-highlighter';
import styles from './element-highlighter.module.scss';

export interface ElementHighlighterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** highlight this element */
  targetRef: RefObject<HTMLElement | null>;
  /** components with metadata to show in the label */
  components?: (ComponentMetaHolder | string)[];

  /** default location of the label */
  placement?: Placement;
  /** customize styles */
  classes?: HighlightClasses;
  /** continually update highlighter to match moving elements */
  watchMotion?: boolean;
}

export { Placement };

export type HighlightClasses = {
  container?: string;
  frame?: string;
  label?: string;
};

export function ElementHighlighter({
  targetRef,
  components,
  placement = 'top',
  watchMotion,
  className,
  classes,
  ...props
}: ElementHighlighterProps) {
  return (
    <div {...props} {...skipHighlighterAttr} className={classnames(classes?.container, styles.container, className)}>
      <Frame targetRef={targetRef} className={classnames(styles.frame, classes?.frame)} watchMotion={watchMotion} />

      {components && (
        <LabelContainer targetRef={targetRef} className={styles.label} placement={placement} watchMotion={watchMotion}>
          <Label components={components} className={classes?.label} />
        </LabelContainer>
      )}
    </div>
  );
}
