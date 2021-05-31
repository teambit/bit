import React, { useState } from 'react';
import { OptionButton } from './option-button';

export const Preview = () => {
  const [active, setActive] = useState(false);

  return <OptionButton icon="code" active={active} onClick={() => setActive(!active)} />;
};

export const Checked = () => {
  const [active, setActive] = useState(true);

  return <OptionButton icon="code" active={active} onClick={() => setActive(!active)} />;
};

export const DifferentSizes = () => {
  const [active, setActive] = useState(false);

  return (
    <div>
      <OptionButton icon="code" active={active} onClick={() => setActive(!active)} style={{ fontSize: 12 }} />{' '}
      <OptionButton icon="code" active={active} onClick={() => setActive(!active)} style={{ fontSize: 24 }} />{' '}
      <OptionButton icon="code" active={active} onClick={() => setActive(!active)} style={{ fontSize: 32 }} />
    </div>
  );
};

export const InlineWithText = () => {
  const [active, setActive] = useState(false);

  return (
    <div>
      lorem ipsum <OptionButton icon="code" active={active} onClick={() => setActive(!active)} /> dolor sit amet
    </div>
  );
};
