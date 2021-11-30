import React, { useMemo, ReactNode } from 'react';
import classNames from 'classnames';
import { ComponentID } from '@teambit/component-id';
import { ComponentUrl, ScopeUrl } from '@teambit/component.modules.component-url';
import {
  componentMetaField,
  ComponentMetaHolder,
} from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import styles from './new-label.module.scss';
import { OtherComponents } from './other-components';

export interface NewLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  components: ComponentMetaHolder[];
}

export function NewLabel({ components, ...props }: NewLabelProps) {
  const last = components.slice(-1).pop();
  if (!last) return null;

  return (
    <div {...props} className={classNames(props.className, styles.newLabel)}>
      <ComponentStrip component={last} />

      {components.length > 1 && (
        <OtherComponents components={components}>
          <span className={styles.othersTooltip}>▾</span>
        </OtherComponents>
      )}
    </div>
  );
}

function Block({ link, children }: { link?: string; children: ReactNode }) {
  const Comp = link ? 'a' : 'span';
  return <Comp href={link}>{children}</Comp>;
}

function ComponentStrip({ component }: { component: ComponentMetaHolder }) {
  const { id, homepage } = component[componentMetaField];

  const parsedId = useMemo(() => ComponentID.tryFromString(id), [id]);

  return (
    <>
      {!parsedId && <Block link={homepage}>{id}</Block>}
      {parsedId && <Block link={ScopeUrl.toUrl(parsedId.scope)}>{parsedId.scope}</Block>}
      {parsedId && (
        <Block link={ComponentUrl.toUrl(parsedId, { includeVersion: true })}>
          {parsedId.fullName}
          {parsedId.version && parsedId.version !== 'latest' && `@${parsedId.version}`}
        </Block>
      )}
    </>
  );
}
