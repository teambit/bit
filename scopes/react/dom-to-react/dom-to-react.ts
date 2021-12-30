import type { ComponentType } from 'react';
import { domToFiber, toRootFiber } from './dom-to-fiber';
import { FiberNode, ForwardRefInstance } from './fiber-node';

export type ReactComponent = ComponentType | ForwardRefInstance;

/**
 * a function that returns the React component of a given
 * DOM node.
 * This supports React 15 and 16+.
 */
export function toRootElement(element: HTMLElement | null) {
  const rootFiber = toRootFiber(domToFiber(element));
  if (!rootFiber) return null;

  // bubble up the DOM to find the element matching the root fiber
  for (let current = element; current; current = current.parentElement) {
    const fiberNode = domToFiber(current);
    if (!fiberNode) return null;

    const parent = fiberNode.return;
    const isRoot = fiberNode === rootFiber || parent === rootFiber;
    if (isRoot) return current;
  }

  return null;
}

/** @deprecated */
export function domToReact(element: HTMLElement | null) {
  const components = domToReacts(element);
  return components.pop();
}

export function domToReacts(element: HTMLElement | null): ReactComponent[] {
  if (element === null) return [];

  const fiberNode = domToFiber(element);
  const rootFiber = toRootFiber(fiberNode);

  return componentsOf(rootFiber);
}

/**
 * lists components that immediately rendered this element
 */
function componentsOf(fiberNode: FiberNode | null): ReactComponent[] {
  const components: ReactComponent[] = [];

  let current = fiberNode;
  while (current && current.type !== null && typeof current.type !== 'string') {
    components.push(current.type);
    current = current.return;
  }

  return components;
}
