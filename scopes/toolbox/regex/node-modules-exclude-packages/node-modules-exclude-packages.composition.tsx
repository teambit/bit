import React, { useState } from 'react';
import { nodeModulesExcludePackages } from './node-modules-exclude-packages';

export function LiveExample() {
  const [text, setText] = useState('react,@myorg,some-lib');
  return (
    <div>
      Live example, write packages separate with a comma:
      <br />
      <input value={text} onChange={(e) => setText(e.target.value)} style={{ width: 500 }} />
      <br />
      <div style={{ backgroundColor: '#ededed', padding: 8 }}>
        {text && nodeModulesExcludePackages({ packages: text.split(',') })}
      </div>
    </div>
  );
}
