import React, { useMemo, ReactNode } from 'react';
import classNames from 'classnames';
import { ComponentID } from '@teambit/component-id';
import { ComponentUrl, ScopeUrl } from '@teambit/component.modules.component-url';
import {
  componentMetaField,
  ComponentMetaHolder,
} from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import styles from './new-label.module.scss';

export interface NewLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  components: ComponentMetaHolder[];
}

export function NewLabel({ components, ...props }: NewLabelProps) {
  const last = components.slice(-1).pop();
  if (!last) return null;

  const meta = last?.[componentMetaField];
  const { id, /* exported, */ homepage } = meta;

  const parsedId = useMemo(() => ComponentID.tryFromString(id), [id]);
  // const componentHref = href || (local ? urljoin('/', fullName) : ComponentUrl.toUrl(componentId));

  return (
    <div {...props} className={classNames(props.className, styles.newLabel)}>
      {!parsedId && <Block link={homepage}>{id}</Block>}
      {parsedId && <Block link={ScopeUrl.toUrl(parsedId.scope)}>{parsedId.scope}</Block>}
      {parsedId && (
        <Block link={ComponentUrl.toUrl(parsedId, { includeVersion: true })}>
          {parsedId.fullName}
          {parsedId.version && parsedId.version !== 'latest' && `@${parsedId.version}`}
        </Block>
      )}

      {components.length > 1 && <span>▾</span>}
    </div>
  );
}

function Block({ link, children }: { link?: string; children: ReactNode }) {
  const Comp = link ? 'a' : 'span';
  return <Comp>{children}</Comp>;
}
