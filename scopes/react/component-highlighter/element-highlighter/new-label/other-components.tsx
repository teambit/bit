import React, { useMemo, HTMLAttributes, ReactElement } from 'react';
import { Card } from '@teambit/base-ui.surfaces.card';
import Tippy from '@tippyjs/react/headless';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { MenuItem } from '@teambit/design.ui.surfaces.menu.item';
import { ComponentID } from '@teambit/component-id';
import { ComponentUrl, ScopeUrl } from '@teambit/component.modules.component-url';
import {
  componentMetaField,
  ComponentMetaHolder,
} from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import styles from './new-label.module.scss';

type OtherComponentsProps = {
  components: ComponentMetaHolder[];
  // selected props from Tippy:
  children: ReactElement<any>;
  visible?: boolean;
  disabled?: boolean;
} & HTMLAttributes<HTMLSpanElement>;

export function OtherComponents({ components, children, visible, disabled, ...rest }: OtherComponentsProps) {
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
    <span {...rest}>
      <Tippy
        visible={visible}
        disabled={disabled}
        placement="bottom"
        interactive
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
    </span>
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
  const { id, homepage } = component[componentMetaField];
  const parsedId = useMemo(() => ComponentID.tryFromString(id), [id]);

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
        <MenuLinkItem external href={ComponentUrl.toUrl(parsedId, { includeVersion: true })}>
          {parsedId.fullName}
          {parsedId.version && parsedId.version !== 'latest' && `@${parsedId.version}`}
        </MenuLinkItem>
      )}
    </>
  );
}
