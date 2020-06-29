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

  navigationLink = {
    to: '~simulation',
    children: 'Simulation'
  };

  route = {
    path: '~simulation',
    children: <ComponentSimulation />
  };
}
