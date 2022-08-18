import React from 'react';
import classNames from 'classnames';
import { Link } from '@teambit/base-react.navigation.link';
import { Icon } from '@teambit/evangelist.elements.icon';
import { textSize } from '@teambit/base-ui.text.text-sizes';
import { links } from '@teambit/community.constants.links';
import styles from './empty-component-gallery.module.scss';

export type EmptyComponentGalleryProps = {
  name: string;
} & React.HTMLAttributes<HTMLDivElement>;

/**
 * page to be shown when workspace/scope has no components
 */
export function EmptyComponentGallery({ name, children }: EmptyComponentGalleryProps) {
  // TODO: get the docs domain from the community aspect and pass it here as a prop
  return (
    <div className={styles.emptyComponentGallery}>
      <div className={styles.title}>
        <span>Export components to</span>&nbsp;
        <span>{name}</span>
      </div>
      <img src="https://static.bit.dev/harmony/no-components.svg" />
      {children}
      <div className={styles.title}>
        <span>New to Bit?</span> &nbsp;
        <Link
          external
          href={`${links.docs}/getting-started/installing-bit/installing-bit`}
          className={styles.purpleLink}
        >
          <span className={styles.text}>Start tutorial</span>
          <Icon of="right_arrow" className={classNames(styles.icon, textSize.xxs)} />
        </Link>
      </div>
      <div className={styles.bottomText}>We're here to help</div>
      <IconLine />
    </div>
  );
}

function IconLine() {
  return (
    <div className={styles.iconLine}>
      <Link external href={links.slack}>
        <img alt="slack-logo" className={styles.logo} src="https://static.bit.dev/harmony/slack-round-icon.svg" />
      </Link>
      <Link external href={links.github}>
        <img alt="github-logo" className={styles.logo} src="https://static.bit.dev/harmony/github.svg" />
      </Link>
      <Link external href="https://bit.cloud/support">
        <img alt="support" className={styles.logo} src="https://static.bit.dev/harmony/support.svg" />
      </Link>
    </div>
  );
}
