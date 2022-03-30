import React, { useMemo, ReactNode, forwardRef, ForwardedRef } from 'react';
import { NativeLink } from '@teambit/base-ui.routing.native-link';
import { ComponentID } from '@teambit/component-id';
import { ScopeUrl } from '@teambit/component.modules.component-url';
import {
  ComponentMeta,
  componentMetaField,
  ComponentMetaHolder,
} from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import styles from './component-strip.module.scss';
import { calcComponentLink } from './links';

interface ComponentStripProps extends React.HTMLAttributes<HTMLDivElement> {
  component: ComponentMetaHolder | string;
}
export const ComponentStrip = forwardRef(function ComponentStrip(
  { component, children }: ComponentStripProps,
  ref: ForwardedRef<HTMLDivElement>
) {
  const { id, homepage, exported } = extractMetadata(component);

  const parsedId = useMemo(() => ComponentID.tryFromString(id), [id]);
  const componentLink = homepage || calcComponentLink(parsedId, exported);

  return (
    <div className={styles.componentStrip} ref={ref}>
      {!parsedId && <LabelBlock link={homepage}>{id}</LabelBlock>}
      {parsedId && <LabelBlock link={ScopeUrl.toUrl(parsedId.scope)}>{parsedId.scope}</LabelBlock>}
      {parsedId && (
        <LabelBlock link={componentLink}>
          {parsedId.fullName}
          {parsedId.version && parsedId.version !== 'latest' && `@${parsedId.version}`}
        </LabelBlock>
      )}
      {children}
    </div>
  );
});

function LabelBlock({ link, children }: { link?: string; children: ReactNode }) {
  const Comp = link ? NativeLink : 'span';
  return (
    <Comp href={link} external={!!link}>
      {children}
    </Comp>
  );
}

function extractMetadata(metadata: string | ComponentMetaHolder): ComponentMeta {
  if (typeof metadata === 'string') {
    return { id: metadata, exported: true };
  }

  return metadata[componentMetaField];
}
