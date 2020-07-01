import React from 'react';
import { Section } from '../component/section';
import { ComponentComposition } from './ui';
import { CompositionsUI } from './compositions.ui';

export class CompositionsSection implements Section {
  constructor(
    /**
     * simulations ui extension.
     */
    private compositions: CompositionsUI
  ) {}

  navigationLink = {
    to: '~compositions',
    children: 'Compositions'
  };

  route = {
    path: '~compositions',
    children: <ComponentComposition />
  };
}
