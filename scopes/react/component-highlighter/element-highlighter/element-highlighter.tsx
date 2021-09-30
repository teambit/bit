import React from 'react';
import classnames from 'classnames';
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
};

export type HighlightClasses = {
  container?: string;
  frame?: string;
  label?: string;
};

export function ElementHighlighter({
  target,
  placement = 'top',
  className,
  classes,
  ...props
}: ElementHighlighterProps) {
  return (
    <div {...props} {...excludeHighlighterAtt} className={classnames(classes?.container, className)}>
      <Frame targetRef={target.element} className={classes?.frame} />

      {target.id && (
        <LabelContainer className={styles.label} targetRef={target.element} placement={placement}>
          <Label
            componentId={target.id}
            link={target.link}
            scopeLink={target.scopeLink}
            local={target.local}
            className={classes?.label}
          />
        </LabelContainer>
      )}
    </div>
  );
}
