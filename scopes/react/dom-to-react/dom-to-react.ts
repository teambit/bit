import type { ComponentType } from 'react';
import { domToFiber, toRootFiber } from './dom-to-fiber';
import { FiberNode } from './fiber-node';

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

export function domToReact(element: HTMLElement | null) {
  if (element === null) return null;

  const fiberNode = domToFiber(element);
  const rootFiber = toRootFiber(fiberNode);

  return rootFiber?.type || null;
}

export function domToReacts(element: HTMLElement | null): ComponentType[] {
  if (element === null) return [];

  const fiberNode = domToFiber(element);
  const rootFiber = toRootFiber(fiberNode);

  return componentsOf(rootFiber);
}

/**
 * lists components that immediately rendered this element
 */
function componentsOf(fiberNode: FiberNode | null) {
  const componentFibers: FiberNode[] = [];

  let current = fiberNode;
  while (current && typeof current.type === 'function') {
    componentFibers.push(current);
    current = current.return;
  }

  const components = componentFibers.map((x) => x.type);
  // fibers type is already checked to be 'function'
  return components as ComponentType[];
}
