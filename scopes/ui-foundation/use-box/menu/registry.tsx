import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import { links } from '@teambit/documenter.content.documentation-links';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { TabContent } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { linkStyles } from '@teambit/ui-foundation.ui.use-box.bottom-link';
import { Link } from '@teambit/base-ui.routing.link';
import { Back } from '@teambit/ui-foundation.ui.use-box.back-button';

export type RegistryProps = {
  registryName: string;
  copyString: string;
  setActive: (active: string) => void;
  prevTab: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Registry({ registryName, copyString, setActive, prevTab }: RegistryProps) {
  return (
    <div>
      <Back onClick={() => setActive(prevTab)} />
      <TabContent
        bottom={
          <Link external href={links.scopedRegistry} className={linkStyles}>
            <Icon of="information-sign" />
            <span>Learn more</span>
          </Link>
        }
      >
        <div>
          Configure <HighlightedText size="xxs">{registryName}</HighlightedText> as a Scoped Registry
        </div>
        <CopyBox>{copyString}</CopyBox>
      </TabContent>
    </div>
  );
}
