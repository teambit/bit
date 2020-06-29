import React from 'react';
import { useRouteMatch, Route } from 'react-router-dom';
import { Section } from '../component/section';
import { TopBarNav } from '../component/ui/top-bar-nav';
import { ComponentSimulation } from './ui';
import { SimulationsExtension } from './simulations.extension';

export class SimulationSection implements Section {
  constructor(
    /**
     * simulations ui extension.
     */
    private sims: SimulationsExtension
  ) {}

  get label() {
    return <TopBarNav to="~simulation">Simulation</TopBarNav>;
  }

  get route() {
    const { path } = useRouteMatch();

    return (
      <Route exact path={`${path}/~simulation`} key={SimulationSection.name}>
        <ComponentSimulation />
      </Route>
    );
  }
}
