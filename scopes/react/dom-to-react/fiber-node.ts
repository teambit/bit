import { ComponentType } from 'react';

/**
 * (internal) A node in React's virtual DOM tree.
 * Reverse engineered from React runtime.
 */
export type FiberNode = {
  // link tree (of React's virtual dom)
  child: FiberNode | null;
  /** next node */
  sibling: FiberNode | null;
  /** "parent" */
  return: FiberNode | null;

  /** 'button', 'div', etc */
  elementType: string;
  /** The React prototype that made this node (Button(), "div", etc) */
  type: ComponentType | string | null;

  key: string | null;
  memoizedProps: Record<any, any>;
  memoizedState: Record<any, any>;
  pendingProps: Record<any, any>;
  ref: any | null;
  tag: number; // (?)
  updateQueue: null | any;
};

// React 16+ Fiber tree
//
// Original:
//	f message()
//		"h2"
//		"div"
//
// translates to this Fiber link tree:
//	const node1 = { type: Message, parent: node1, sibling: null, ... }
//	const node2 = { type: "h2", parent: node1, sibling: node3, ... }
//	const node3 = { type: "div", parent: node1, sibling: null, ... }
//
// * this structure allows traversal through the tree without recursion, and with the ability to pause and continue later on.
// * React Fragments (`<>`) are not represented in the tree.
// * Only react instances (`<Component {...} />`) are included in the tree (but not `Component(props)`)
