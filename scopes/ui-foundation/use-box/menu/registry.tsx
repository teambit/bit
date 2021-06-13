import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
// import { Link } from "@teambit/ui.routing.link";
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import { links } from '@teambit/documenter.content.documentation-links';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { TabContent } from '../tab-content';
import { linkStyles } from '../bottom-link';
import { Back } from '../back-button';
import styles from './menu.module.scss';

export type RegistryProps = {
  registryName: string;
  copyString: string;
  setActive: (active: string) => void;
  prevTab: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function Registry({ registryName, copyString, setActive, prevTab }: RegistryProps) {
  return (
    <div>
      <Back setActive={setActive} prevTab={prevTab} />
      <TabContent
        bottom={
          <a target="_blank" rel="noreferrer" href={links.scopedRegistry} className={classNames(linkStyles)}>
            <Icon of="information-sign" />
            <span>Learn more</span>
          </a>
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
