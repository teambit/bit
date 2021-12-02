import React, { useMemo, ReactNode, useState } from 'react';
import classNames from 'classnames';
import { NativeLink } from '@teambit/base-ui.routing.native-link';
import { ComponentID } from '@teambit/component-id';
import { ScopeUrl } from '@teambit/component.modules.component-url';
import {
  componentMetaField,
  ComponentMetaHolder,
} from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import styles from './label.module.scss';
import { OtherComponents } from './other-components';
import { calcComponentLink } from './links';

export interface LabelProps extends React.HTMLAttributes<HTMLDivElement> {
  components: ComponentMetaHolder[];
}

export function Label({ components, ...props }: LabelProps) {
  const [appendTo, setAppendTo] = useState<HTMLDivElement | null>(null);
  const last = components.slice(-1).pop();
  if (!last) return null;

  return (
    <>
      <div {...props} className={classNames(props.className, styles.newLabel)}>
        <ComponentStrip component={last} />

        {components.length > 1 && (
          <OtherComponents components={components} appendTo={appendTo || undefined} hideOnClick={false}>
            <span className={styles.othersTooltip} />
          </OtherComponents>
        )}
      </div>
      <div ref={setAppendTo}></div>
    </>
  );
}

function ComponentStrip({ component }: { component: ComponentMetaHolder }) {
  const { id, homepage, exported } = component[componentMetaField];

  const parsedId = useMemo(() => ComponentID.tryFromString(id), [id]);
  const componentLink = homepage || calcComponentLink(parsedId, exported);

  return (
    <>
      {!parsedId && <LabelBlock link={homepage}>{id}</LabelBlock>}
      {parsedId && <LabelBlock link={ScopeUrl.toUrl(parsedId.scope)}>{parsedId.scope}</LabelBlock>}
      {parsedId && (
        <LabelBlock link={componentLink}>
          {parsedId.fullName}
          {parsedId.version && parsedId.version !== 'latest' && `@${parsedId.version}`}
        </LabelBlock>
      )}
    </>
  );
}

function LabelBlock({ link, children }: { link?: string; children: ReactNode }) {
  const Comp = link ? NativeLink : 'span';
  return (
    <Comp href={link} external={!!link}>
      {children}
    </Comp>
  );
}
