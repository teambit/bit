import React, { useMemo } from 'react';
import { Card } from '@teambit/base-ui.surfaces.card';
import Tippy, { TippyProps } from '@tippyjs/react/headless';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { MenuItem } from '@teambit/design.ui.surfaces.menu.item';
import { ComponentID } from '@teambit/component-id';
import { ScopeUrl } from '@teambit/component.modules.component-url';
import {
  componentMetaField,
  ComponentMetaHolder,
} from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import styles from './new-label.module.scss';
import { calcComponentLink } from './links';

type OtherComponentsProps = {
  components: ComponentMetaHolder[];
} & TippyProps;

export function OtherComponents({
  components,
  children,
  placement = 'bottom',
  interactive = true,
  ...tippyProps
}: OtherComponentsProps) {
  const content = (
    <>
      <MenuItem className={styles.otherInfo} interactive={false}>
        Components associated to this element:
      </MenuItem>
      <div className={styles.extraComponent}>
        <Titles />
        {components.map((comp, idx) => (
          <ComponentStrip key={idx} component={comp} />
        ))}
      </div>
    </>
  );

  return (
    <Tippy
      placement={placement}
      interactive={interactive}
      {...tippyProps}
      // second parameter "content" is always undefined, use content inline
      // https://github.com/atomiks/tippyjs-react/issues/341
      render={(attrs) => (
        <Card elevation="high" {...attrs} className={styles.extraComponentsPad}>
          {content}
        </Card>
      )}
    >
      {children}
    </Tippy>
  );
}

function Titles() {
  return (
    <>
      <MenuItem className={styles.othersTitle} interactive={false}>
        Scope
      </MenuItem>
      <MenuItem className={styles.othersTitle} interactive={false}>
        Component
      </MenuItem>
    </>
  );
}
function ComponentStrip({ component }: { component: ComponentMetaHolder }) {
  const { id, homepage, exported } = component[componentMetaField];
  const parsedId = useMemo(() => ComponentID.tryFromString(id), [id]);
  const componentLink = homepage || calcComponentLink(parsedId, exported);

  return (
    <>
      {!parsedId && (
        <MenuLinkItem external href={homepage}>
          {id}
        </MenuLinkItem>
      )}
      {parsedId && (
        <MenuLinkItem external href={ScopeUrl.toUrl(parsedId.scope)}>
          {parsedId.scope}
        </MenuLinkItem>
      )}
      {parsedId && (
        <MenuLinkItem external href={componentLink}>
          {parsedId.fullName}
          {parsedId.version && parsedId.version !== 'latest' && `@${parsedId.version}`}
        </MenuLinkItem>
      )}
    </>
  );
}
