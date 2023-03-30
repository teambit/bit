import React from 'react';
import { NavigationProvider, RouterContextType } from './navigation-provider';
import { Link } from './link';

export const BasicLink = () => <Link href="https://bit.dev">bit.dev</Link>;
export const ExternalLink = () => (
  <div>
    This link will be external: (ie, it will open in a new tab)
    <div>
      <Link href="https://bit.dev" external>
        bit.dev
      </Link>
    </div>
  </div>
);

export const ActiveLink = () => (
  <div style={{ padding: 20 }}>
    <div>
      current url:
      <div style={{ textDecoration: 'underline' }}>{typeof window !== 'undefined' && window.location.pathname}</div>
      (active links should be orange)
    </div>

    <br />

    <div>
      local link:{' '}
      <Link href="/preview/teambit.react/react" activeStyle={{ color: 'darkorange' }}>
        /preview/teambit.react/react
      </Link>
    </div>
    <div>
      base-react scope link{' '}
      <Link href="/api/teambit.base-react" activeStyle={{ color: 'darkorange' }}>
        /api/teambit.base-react
      </Link>
    </div>
    <div>
      another link:
      <Link href="inactive/link" activeStyle={{ color: 'darkorange' }}>
        inactive/link
      </Link>
    </div>
  </div>
);

const navA: RouterContextType = {
  Link: ({ children, ...props }: any) => (
    <a {...props} role="img">
      {children} 🔗
    </a>
  ),
};

const navB: RouterContextType = {
  Link: ({ style, ...props }: any) => (
    <a {...props} style={{ textDecoration: 'none', fontWeight: 'bolder', ...style }}>
      {props.children}
    </a>
  ),
};

export const MultipleRoutingSystems = () => (
  <div>
    <NavigationProvider implementation={navA}>
      <span>System 1</span> <Link href="https://bit.dev">Link</Link>
    </NavigationProvider>
    <br />
    <NavigationProvider implementation={navB}>
      <span>System 2</span> <Link href="https://bit.dev">Link</Link>
    </NavigationProvider>
    <br />
    <br />
    Default <Link href="https://bit.cloud">Link</Link>
  </div>
);
