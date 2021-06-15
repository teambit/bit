import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { links } from '@teambit/documenter.content.documentation-links';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { TabContent } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { Back } from '@teambit/ui-foundation.ui.use-box.back-button';
import { Link } from '@teambit/base-ui.routing.link';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';

export type BitInfoProps = {
  setActive: (active: string) => void;
  prevTab: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function BitInfo({ setActive, prevTab, ...rest }: BitInfoProps) {
  return (
    <div {...rest}>
      <Back onClick={() => setActive(prevTab)} />
      <TabContent
        bottom={
          <Link external href={links.installBit} className={linkStyles}>
            <Icon of="information-sign" />
            <span>Learn more</span>
          </Link>
        }
      >
        <div>Install bit version manager</div>
        <CopyBox>npm i -g @teambit/bvm</CopyBox>
        <div>Install bit</div>
        <CopyBox>bvm install</CopyBox>
      </TabContent>
    </div>
  );
}
