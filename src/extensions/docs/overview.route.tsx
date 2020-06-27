import React from 'react';
import { Route, useRouteMatch } from 'react-router-dom';
import { Overview } from './overview';

export function OverviewRoute() {
  const { path } = useRouteMatch();

  return (
    <Route exact path={`${path}/~overview`}>
      <Overview />
    </Route>
  );
}
