import { domToFiber, toRootFiber, fiberToPrototype } from './dom-to-fiber';

/**
 * a function that returns the React component of a given
 * DOM node.
 * This supports React 15 and 16+.
 */
export function toRootElement(element: HTMLElement | null) {
  const rootFiber = toRootFiber(domToFiber(element));
  if (!rootFiber) return null;

  for (let current = element; current; current = current.parentElement) {
    const fiberNode = domToFiber(current);
    if (!fiberNode) return null;

    const isComponentRoot = fiberNode === rootFiber || fiberNode.return === rootFiber;

    if (isComponentRoot) return current;
  }

  return null;
}

export function domToReact(element: HTMLElement | null) {
  if (element === null) return null;

  const fiberNode = domToFiber(element);
  if (!fiberNode) return null;

  const prototype = fiberToPrototype(fiberNode);
  return prototype;
}
