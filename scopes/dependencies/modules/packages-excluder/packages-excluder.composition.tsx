import React, { useState } from 'react';
import { generateNodeModulesPatterns } from './generate-node-modules-patterns';

export function LiveExample() {
  const [text, setText] = useState('react,@myorg,some-lib');
  return (
    <div>
      Live example, write packages separate with a comma:
      <br />
      <input value={text} onChange={(e) => setText(e.target.value)} style={{ width: 500 }} />
      <br />
      <div style={{ backgroundColor: '#ededed', padding: 8 }}>
        {text && generateNodeModulesPatterns({ packages: text.split(',') })}
      </div>
    </div>
  );
}
