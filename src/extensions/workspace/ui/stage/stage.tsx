import React from 'react';
import { Route, Switch, useRouteMatch } from 'react-router-dom';
import { PageSlotRegistry } from '../../workspace.ui';

export type StageProps = {
  pageSlot: PageSlotRegistry;
};

export function Stage({ pageSlot }: StageProps) {
  const pages = pageSlot.values();
  const { path: basePath } = useRouteMatch();
  // const path =

  return (
    <div>
      <Switch>
        {pages.map(({ path, ...rest }, idx) => (
          // TODO - stable key
          <Route key={idx} {...rest} path={joinPath(basePath, path)} />
        ))}
      </Switch>
    </div>
  );
}

function joinPath(base: string, path: string | string[] | undefined) {
  if (!path) return base;

  if (typeof path === 'string') {
    return `${base}/${path}`;
  }

  return path.map(x => joinPath(base, x));
}
