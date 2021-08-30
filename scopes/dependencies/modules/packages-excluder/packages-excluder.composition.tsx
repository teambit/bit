import React, { useState } from 'react';
import { generateNodeModulesPattern } from './generate-node-modules-pattern';

export function LiveExample() {
  const [text, setText] = useState('react,@myorg,some-lib');
  return (
    <div>
      Live example, write packages separate with a comma:
      <br />
      <input value={text} onChange={(e) => setText(e.target.value)} style={{ width: 500 }} />
      <br />
      <div style={{ backgroundColor: '#ededed', padding: 8 }}>
        {text && generateNodeModulesPattern({ packages: text.split(',') })}
      </div>
    </div>
  );
}
