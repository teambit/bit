import React from 'react';
import { SidebarLoader } from './sidebar-loader';

export const BasicSidebar = () => <SidebarLoader data-testid="sidebar-skeleton" />;

BasicSidebar.canvas = {
  maxHeight: 400,
  display: 'flex',
  alignItems: 'end',
};
