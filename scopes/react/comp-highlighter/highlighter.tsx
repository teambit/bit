import React, { useState, useCallback } from 'react';
import { Frame } from './frame';
import { Label } from './label';

export interface ComponentHighlightProps extends React.HTMLAttributes<HTMLDivElement> {}

export function ComponentHighlighter({ children }: ComponentHighlightProps) {
  const [text, setText] = useState<string | undefined>(undefined);
  const [highlighted, setHighlighted] = useState<HTMLElement | null>(null);

  const handleEnter = useCallback((event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    const { target } = event;
    if (!target) return;

    const element = target as HTMLElement;
    const [componentElement, componentId] = findComponentAncestor(element) || [];

    if (componentElement) {
      setHighlighted(componentElement);
      setText(componentId);
    }
  }, []);

  const handleLeave = useCallback(() => {
    setHighlighted(null);
  }, []);

  return (
    <div
      onMouseOver={handleEnter}
      onMouseLeave={handleLeave}
      style={{ fontFamily: 'sans-serif' }}
      data-ignore-component-highlight
    >
      {children}
      <Frame targetRef={highlighted} />
      {text && <Label targetRef={highlighted} offset={[0, 8]} placement="top" componentId={text} />}
    </div>
  );
}

function findComponentAncestor(target: HTMLElement | null): [HTMLElement, string] | undefined {
  console.log('finding ancestor...');
  let counter = 0;
  //   debugger;
  for (let elem = target; elem; elem = elem ? elem.parentElement : null) {
    // ignore by attribute
    if (elem.hasAttribute('data-ignore-component-highlight')) return undefined;

    const component = domToReact(target);
    console.log('trying component', counter++, elem, component?.name, component?.componentId);
    if (component && isValidComponentID(component.componentId)) return [elem, component.componentId];

    // const legacyId = elem.getAttribute('data-bit-id');
    // if (legacyId) return [elem, legacyId];
  }

  return undefined;
}

/**
 * a function that returns the React component of a given
 * DOM node.
 * This supports React 15 and 16+.
 */
function domToReact(element: HTMLElement | null) {
  // console.log("react version", React.version);

  if (!element) return null;

  return domToReact17(element) || domToReact16(element);
}

function domToReact17(element: HTMLElement) {
  const reactInstanceKey = Object.keys(element).find((key) => key.startsWith('__reactFiber'));

  if (!reactInstanceKey) return undefined;
  // @ts-ignore
  const fiberNode = element[reactInstanceKey];
  return fiberNode?._debugOwner?.elementType;
  //  return fiberNode?.return?.type;
}

function domToReact16(element: HTMLElement) {
  const reactInstanceKey = Object.keys(element).find((key) => key.startsWith('__reactInternalInstance'));

  if (!reactInstanceKey) return undefined;
  // @ts-ignore
  const fiberNode = element[reactInstanceKey];

  //   return fiberNode?._debugOwner?.elementType;
  return fiberNode?.return?.type;
}

const bitIdRegex = /^([^./@]+)\.([^./@]+)(\/([^.@]+))(@([^@]*))?$/;
const isValidComponentID = (str?: string) => !!str && bitIdRegex.test(str);
