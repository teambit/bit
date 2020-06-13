import React from 'react';
import { SideBar } from './side-bar';
import { TopBar } from './top-bar';

/**
 * main workspace component.
 */
export function Workspace() {
  return (
    <div>
      <TopBar />
      <SideBar />
    </div>
  );
}
