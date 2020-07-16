import React from 'react';
import { DependenciesPage } from './ui/dependencies-page';
import { Section } from '../component/section';
// import styles from './changelog.module.scss';

export class DependenciesSection implements Section {
  route = {
    path: '~dependencies',
    children: <DependenciesPage />
  };
  navigationLink = {
    to: '~dependencies',
    children: 'Dependencies'
  };
}
