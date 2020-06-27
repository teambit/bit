import React from 'react';
import { useRouteMatch, Route } from 'react-router-dom';
import { Section } from '../component/section';
import { TopBarNav } from '../component/ui/top-bar-nav';
import { DocsUI } from './docs.ui';
import { OverviewRoute } from './overview.route';
import { Overview } from './overview';

export class OverviewSection implements Section {
  constructor(
    /**
     * docs ui extension.
     */
    private docs: DocsUI
  ) {}

  get label() {
    return <TopBarNav to="~overview">Overview</TopBarNav>;
  }

  get route() {
    const { path, url } = useRouteMatch();

    return (
      <Route exact path={`${path}/~overview`} key={OverviewSection.name}>
        <Overview />
      </Route>
    );
  }
}
