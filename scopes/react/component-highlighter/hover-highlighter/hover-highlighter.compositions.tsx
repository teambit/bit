import React, { useEffect, useState } from 'react';
import { HoverHighlighter } from './hover-highlighter';
import { MockButton, MockTarget } from '../mock-component';
import { excludeHighlighterAtt } from '../ignore-highlighter';

export const ShowWhenHovering = () => {
  const [disabled, setDisabled] = useState<boolean>(false);

  return (
    <div style={{ padding: '16px 50px 32px 16px', minWidth: 300, fontFamily: 'sans-serif' }}>
      <HoverHighlighter style={{ padding: 16 }} disabled={disabled}>
        <div>
          <br />
          <div>
            <MockButton onClick={() => setDisabled((x) => !x)}>Hover here</MockButton>
          </div>
          <div>
            {disabled ? 'X' : '✓'} highlighter is {disabled ? 'disabled' : 'enabled'}
          </div>
        </div>
      </HoverHighlighter>
    </div>
  );
};

export const UnmountingElement = () => {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const tid = setInterval(() => setShown((x) => !x), 1500);
    return () => clearInterval(tid);
  }, []);

  return (
    <div style={{ padding: '16px 50px 32px 16px', minWidth: 300, fontFamily: 'sans-serif' }}>
      <HoverHighlighter>
        <div>{!shown && '(hidden)'}</div>

        <div>{shown && <MockButton>Hover here</MockButton>}</div>
        <br />
        <MockTarget>
          <div>{shown && <MockButton>Hover here</MockButton>}</div>
          <div>same with a container</div>
        </MockTarget>
      </HoverHighlighter>
    </div>
  );
};

export const HoverExclusionZones = () => {
  return (
    <div style={{ padding: '16px 50px 32px 16px', minWidth: 300, fontFamily: 'sans-serif' }}>
      <HoverHighlighter>
        <MockTarget>
          container (target-able)
          <div>{<MockButton>will be highlighted</MockButton>}</div>
        </MockTarget>
        <br />
        <MockTarget>
          container (target-able)
          <div {...excludeHighlighterAtt}>{<MockButton>will be ignored</MockButton>}</div>
        </MockTarget>
      </HoverHighlighter>
    </div>
  );
};
