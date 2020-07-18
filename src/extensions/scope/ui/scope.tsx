import React from 'react';
import { RouteSlot } from '../../react-router/slot-router';

export type ScopeProps = {
  routeSlot: RouteSlot;
};

/**
 * root component of the scope
 */
export function Scope(props: ScopeProps) {
  return <div>hello there scope</div>;
}
