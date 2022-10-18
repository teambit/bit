import React, { CSSProperties, HTMLAttributes } from 'react';
import { Link } from '@teambit/base-react.navigation.link';
import { links } from '@teambit/community.constants.links';

const styles: Record<string, CSSProperties> = {
  link: {
    textDecoration: 'none',
    lineHeight: 'inherit',
    color: 'unset',
  },
  logo: {
    width: '24px',
    height: '24px',
    margin: '0 13px',
  },
};

export type ContactIconsProps = HTMLAttributes<HTMLDivElement>;

// TODO: get the docs domain from the community aspect and pass it here as a prop
export function ContactIcons(props: ContactIconsProps) {
  return (
    <div style={{ ...styles.iconLine, ...props.style }} {...props}>
      <Link external style={styles.link} href={links.slack}>
        <img alt="slack" style={styles.logo} src="https://static.bit.dev/harmony/slack-round-icon.svg" />
      </Link>
      <Link external style={styles.link} href={links.github}>
        <img alt="github" style={styles.logo} src="https://static.bit.dev/harmony/github.svg" />
      </Link>
      <Link external style={styles.link} href={links.docs}>
        <img alt="bit docs" style={styles.logo} src="https://static.bit.dev/bit-logo.svg" />
      </Link>
    </div>
  );
}
