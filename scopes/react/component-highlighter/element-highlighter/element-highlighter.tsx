import React from 'react';
import { Frame } from '../frame';
import { Label, LabelContainer } from '../label';
import { excludeHighlighterAtt } from '../ignore-highlighter';
import styles from './element-highlighter.module.scss';

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

export type ElementHighlighterProps = { target: HighlightTarget } & React.HTMLAttributes<HTMLDivElement>;

export function ElementHighlighter({ target, ...props }: ElementHighlighterProps) {
  return (
    <div className={styles.elementHighlighter} {...props} {...excludeHighlighterAtt}>
      <Frame targetRef={target.element} />

      {target.id && (
        <LabelContainer className={styles.label} targetRef={target.element} placement="top">
          <Label componentId={target.id} link={target.link} scopeLink={target.scopeLink} local={target.local} />
        </LabelContainer>
      )}
    </div>
  );
}
