import React from 'react';
import { Section } from '../component/section';
import { ComponentComposition } from './ui';
import { CompositionsExtension } from './compositions.extension';

export class SimulationSection implements Section {
  constructor(
    /**
     * simulations ui extension.
     */
    private compositions: CompositionsExtension
  ) {}

  navigationLink = {
    to: '~simulation',
    children: 'Simulation'
  };

  route = {
    path: '~simulation',
    children: <ComponentComposition />
  };
}
