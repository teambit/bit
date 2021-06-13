import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { links } from '@teambit/documenter.content.documentation-links';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { TabContent } from '../tab-content';
import { Back } from '../back-button';
import { linkStyles } from '../bottom-link';

export type BitInfoProps = {
  setActive: (active: string) => void;
  prevTab: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function BitInfo({ setActive, prevTab }: BitInfoProps) {
  return (
    <div>
      <Back setActive={setActive} prevTab={prevTab} />
      <TabContent
        bottom={
          <a target="_blank" rel="noreferrer" href={links.installBit} className={classNames(linkStyles)}>
            <Icon of="information-sign" />
            <span>Learn more</span>
          </a>
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
