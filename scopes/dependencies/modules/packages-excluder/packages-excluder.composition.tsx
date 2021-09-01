import React, { useState, useEffect } from 'react';
import { generateNodeModulesPattern } from './generate-node-modules-pattern';

export function LiveExample() {
  const [text, setText] = useState('react,@myorg,some-lib');
  return (
    <div>
      <div>Live example, write packages to exclude separate with a comma:</div>
      <input value={text} onChange={(e) => setText(e.target.value)} style={{ width: 300 }} />
      <div style={{ backgroundColor: '#ededed', padding: 8 }}>
        {text && generateNodeModulesPattern({ packages: text.split(',') })}
      </div>
    </div>
  );
}

export function RegexExample() {
  const [packagesToExclude, setPackagesToExclude] = useState('@myorg,react,some-lib');
  const [packageToCheck, setPackageToCheck] = useState('@myorg');
  const [regexResult, setRegexResult] = useState(true);

  useEffect(() => {
    const pattern = generateNodeModulesPattern({ packages: packagesToExclude.split(',') });
    const regex = new RegExp(pattern);
    setRegexResult(regex.test(`node_modules/${packageToCheck}/some-path`) === false);
  }, [packagesToExclude, packageToCheck]);

  return (
    <div style={{ width: 500 }}>
      <div>Live example, write packages to exclude separate with a comma:</div>
      <input
        value={packagesToExclude}
        onChange={(e) => setPackagesToExclude(e.target.value)}
        style={{ width: 300, marginBottom: 12 }}
      />
      <div>Write a package that you want to check with Regex test:</div>
      <div style={{ marginBottom: 12 }}>
        <input value="node_modules/" disabled />
        <input value={packageToCheck} onChange={(e) => setPackageToCheck(e.target.value)} />
        <input value="/some-path" disabled />
      </div>
      <div style={{ backgroundColor: '#ededed', padding: 8 }}>
        regex exclude {packageToCheck} package: {regexResult.toString()}
      </div>
    </div>
  );
}
