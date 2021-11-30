import React, { ComponentType } from 'react';
import classnames from 'classnames';
import { ComponentMetaHolder } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { Frame } from '../frame';
import { /* Label, */ LabelContainer, Placement } from '../label';
import { excludeHighlighterAtt } from '../ignore-highlighter';
import styles from './element-highlighter.module.scss';
import { NewLabel } from './new-label';

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
  id?: string;
  element: HTMLElement;
  /** e.g. 'https://bit.dev/teambit/base-ui/elements/dots-loader', */
  link?: string;
  /** e.g. 'https://bit.dev/teambit/base-ui' */
  scopeLink?: string;
  /** use full production url, or local workspace url */
  local?: boolean;

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
          <NewLabel components={target.components} className={classes?.label} />
          {/* <Label
            componentId={target.id}
            link={target.link}
            scopeLink={target.scopeLink}
            local={target.local}
            className={classes?.label}
          /> */}
        </LabelContainer>
      )}
    </div>
  );
}
