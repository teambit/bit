import { FiberNode } from './fiber-node';

const react17Key = '__reactFiber';
const react16Key = '__reactInternalInstance';

/**
 * Extracts React's fiberNode from dom element.
 * Note that fiber node is almost always the immediate domNode! (e.g. "div")
 */
export function domToFiber(element: HTMLElement | null) {
  if (!element) return null;

  const fiberKey = Object.keys(element).find((key) => key.startsWith(react17Key) || key.startsWith(react16Key));
  if (!fiberKey) return null;

  // @ts-ignore
  const fiberNode: FiberNode | undefined = element[fiberKey];
  if (!fiberNode) return null;

  return fiberNode;
}

/**
 * Returns the root FiberNode of the current component.
 * @example
 * const root = toRoot(fiber);
 * console.log(root.type); // function LoginForm()
 */
export function toRootFiber(fiberNode: FiberNode | null): FiberNode | null {
  for (let current = fiberNode; current !== null && current.type !== null; current = current.return) {
    if (typeof current.type === 'function') return current;
  }

  return null;
}

/**
 * Return the nearest React Component Prototype containing the FiberNode
 * @example
 * const comp = fiberToPrototype(fiber);
 * console.log(comp); // function LoginForm()
 */
export function fiberToPrototype(fiberNode: FiberNode | null) {
  return toRootFiber(fiberNode)?.type || null;
}

// React 15 is not using Fiber, so support for it is more complicated.
// Structure is made out of 2 types:
//
// * ReactCompositeComponentWrapper
//	* _currentElement: ReactDomNode
// * ReactDomNode:
//	* _owner --> parent ReactCompositeComponentWrapper (equivalent of 'return' in Fiber)
//	* type --> component that made this node (Button, "div", etc)
//
// So, getting to parent node will be:
// node._currentElement._owner
//
// Getting children will be - ??
// Getting siblings will be - ??
//
//
// Getting React Component will be:
// node._currentElement.type

// type ReactDomNode15 = {
//     $$typeof: any; // Symbol(react.element)
//     key: null;
//     props: {};
//     ref: null;
//     type: ComponentType | string | null;
//     _owner: ReactCompositeComponentWrapper | null;
//     _store: { validated: true };
//     _self: null;
//     _source: null | {
//         fileName: string;
//         lineNumber: number;
//         columnNumber: number;
//     };
// };

// type ReactCompositeComponentWrapper = {
//     _calledComponentWillUnmount: false;
//     _compositeType: number;
//     _context: {};
//     _currentElement: ReactDomNode15;
//     _debugID: {};
//     _hostContainerInfo:  {_topLevelWrapper: ReactCompositeComponentWrapper, _idCounter: 10, _ownerDocument: document, _node: div#root, _tag: "div", …}
//     _hostParent: ReactDOMComponent {_currentElement: {…}, _tag: "div", _namespaceURI: "http://www.w3.org/1999/xhtml", _renderedChildren: {…}, _previousStyle: {…}, …}
//     _instance: StatelessComponent {props: {…}, context: {…}, refs: {…}, updater: {…}, _reactInternalInstance: ReactCompositeComponentWrapper, …}
//     _mountImage: null;
//     _mountIndex: 0;
//     _mountOrder: 4;
//     _pendingCallbacks: null;
//     _pendingElement: null;
//     _pendingForceUpdate: false;
//     _pendingReplaceState: false;
//     _pendingStateQueue: null;
//     _renderedNodeType: 0;
//     _rootNodeID: 0;
//     _topLevelWrapper: null;
//     _updateBatchNumber: null;
//     _warnedAboutRefsInRender: false;
// };
