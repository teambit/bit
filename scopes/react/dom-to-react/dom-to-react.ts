/**
 * a function that returns the React component of a given
 * DOM node.
 * This supports React 15 and 16+.
 */
export function domToReact(element: Element | null) {
  if (!element) return null;
  const reactInstanceKey = Object.keys(element).find((key) => key.startsWith('__reactInternalInstance$'));

  if (!reactInstanceKey) return null;
  const reactInstance = element[reactInstanceKey];

  // React < 16
  if (reactInstance._currentElement) {
    let compFiber = reactInstance._currentElement._owner;
    compFiber = compFiber._currentElement._owner;
    // TODO: test on React 15.
    return compFiber.type;
  }

  return reactInstance.return.type;
}
