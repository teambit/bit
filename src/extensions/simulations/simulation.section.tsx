import React from 'react';
import { Section } from '../component/section';
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
