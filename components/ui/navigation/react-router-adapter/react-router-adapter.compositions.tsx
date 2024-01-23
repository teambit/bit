import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { NavigationProvider, Link, useLocation, useNavigate } from '@teambit/base-react.navigation.link';

import { reactRouterAdapter } from './react-routing-provider';

export const AdapterLink = () => {
  return (
    <MemoryRouter>
      <NavigationProvider implementation={reactRouterAdapter}>
        <CurrentLocation />
        <div>
          <Link href="/one">link - one</Link>
        </div>
        <div>
          <Link href="/two">link - two</Link>
        </div>
        <div>
          <ProgrammaticLink href="/programmatic-link">link (programmatic)</ProgrammaticLink>
        </div>
      </NavigationProvider>
    </MemoryRouter>
  );
};

function ProgrammaticLink({ children, href }: { children: any; href?: string }) {
  const navigate = useNavigate();

  return (
    <span onClick={href ? () => navigate(href) : undefined} style={{ cursor: 'pointer' }}>
      {children}
    </span>
  );
}

function CurrentLocation() {
  const location = useLocation();
  return (
    <div>
      location is: <code>{location?.pathname}</code>
    </div>
  );
}
