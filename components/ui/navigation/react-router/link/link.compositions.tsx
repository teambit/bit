import React from 'react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { Link } from './link';

export const Preview = () => (
  <MemoryRouter>
    <SomeLinks />
  </MemoryRouter>
);

function SomeLinks() {
  const location = useLocation();

  return (
    <div>
      <div>location: {JSON.stringify(location, undefined, 1)}</div>

      <div>
        link:{' '}
        <Link href="/path/one?what=is" state={{ some: 'state' }}>
          link1
        </Link>
        <br />
        link: <Link href="/path/two">link2</Link>
      </div>

      <Route path="/path/one">First path</Route>
      <Route path="/path/two">Second path</Route>
    </div>
  );
}
