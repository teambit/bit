import React from 'react';
import { ResponsiveNavbar } from './responsive-navbar';

const style = {
  margin: 16,
};

const contentTabs = [
  {
    component: function Tab() {
      return <div>Tab 1</div>;
    },
  },
  {
    component: function Tab() {
      return <div>Tab 2</div>;
    },
  },
  {
    component: function Tab() {
      return <div>Tab 3</div>;
    },
    style: { marginLeft: 'auto' },
  },
];

export function LineTabs() {
  return <ResponsiveNavbar tabs={contentTabs} style={style} data-testid="responsive-menu" />;
}

export function FolderTabs() {
  return <ResponsiveNavbar tabs={contentTabs} priority="folder" style={style} />;
}

export function TabsWithPropritySetToNone() {
  return <ResponsiveNavbar tabs={contentTabs} priority="none" style={style} />;
}
