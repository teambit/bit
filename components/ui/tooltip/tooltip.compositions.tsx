import React from 'react';
import { Tooltip } from './tooltip';
import { SingletonTooltipProvider } from './singleton-instance';

export function Preview() {
  return (
    <div>
      <div>outside</div>
      <Tooltip content="tooltip">
        <div style={{ border: '1px solid black' }}>hover me!</div>
      </Tooltip>
    </div>
  );
}

export function TextChild() {
  return (
    <div>
      <Tooltip content="tooltip">text element</Tooltip>
    </div>
  );
}

export function ReactTooltip() {
  return (
    <div>
      <Tooltip
        content={
          <ul style={{ listStyle: 'circle', paddingLeft: 16 }}>
            <li>1</li>
            <li>2</li>
          </ul>
        }
      >
        target
      </Tooltip>
    </div>
  );
}

export function WithOffset() {
  return (
    <div>
      <Tooltip content="tooltip" offset={[0, 40]}>
        target
      </Tooltip>
    </div>
  );
}

export function WithSkid() {
  return (
    <div>
      <Tooltip content="tooltip" offset={[15, 0]}>
        target
      </Tooltip>
    </div>
  );
}

export function CustomPlacement() {
  return (
    <div>
      <Tooltip content="tooltip" placement="bottom-start">
        target
      </Tooltip>
    </div>
  );
}

export function Disabled() {
  return (
    <div>
      <Tooltip content="tooltip" disabled>
        target
      </Tooltip>
    </div>
  );
}

export function UsingSingletonPopper() {
  /*
   * tooltips use the same popper instance,
   * so they receive the same delay,
   * but do not have delay between them
   */

  return (
    <div>
      <SingletonTooltipProvider delay={500}>
        <Tooltip content="tooltip">
          <div>target</div>
        </Tooltip>
        <Tooltip content="tooltip">
          <div>target</div>
        </Tooltip>
        <Tooltip content="tooltip">
          <div>target</div>
        </Tooltip>
      </SingletonTooltipProvider>
    </div>
  );
}
