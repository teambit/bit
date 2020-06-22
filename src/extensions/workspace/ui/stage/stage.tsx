import React from 'react';
import { Route, Switch } from 'react-router-dom';
import { PageSlotRegistry } from '../../workspace.ui';

export type StageProps = {
  pageSlot: PageSlotRegistry;
};

export function Stage({ pageSlot }: StageProps) {
  const pages = pageSlot.values();

  return (
    <div>
      <Switch>
        {pages.map((props, idx) => (
          // TODO - stable key
          <Route key={idx} {...props} />
        ))}
      </Switch>
    </div>
  );
}
