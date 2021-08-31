import React, { useState, useEffect } from 'react';
import { generateNodeModulesPattern } from './generate-node-modules-pattern';

export function LiveExample() {
  const [text, setText] = useState('react,@myorg,some-lib');
  return (
    <div>
      Live example, write packages to exclude separate with a comma:
      <br />
      <input value={text} onChange={(e) => setText(e.target.value)} style={{ width: 500 }} />
      <br />
      <div style={{ backgroundColor: '#ededed', padding: 8 }}>
        {text && generateNodeModulesPattern({ packages: text.split(',') })}
      </div>
    </div>
  );
}

export function RegexExample() {
  const [packagesToExclude, setPackagesToExclude] = useState('react,@myorg,some-lib');
  const [packageToCheck, setPackageToCheck] = useState('');
  const [regexResult, setRegexResult] = useState(true);

  useEffect(() => {
    const pattern = generateNodeModulesPattern({ packages: packagesToExclude.split(',') });
    const regex = new RegExp(pattern);
    setRegexResult(regex.test(`node_modules/${packageToCheck}/something`) === false);
  }, [packagesToExclude, packageToCheck]);

  return (
    <div>
      Live example, write packages to exclude separate with a comma:
      <br />
      <input value={packagesToExclude} onChange={(e) => setPackagesToExclude(e.target.value)} style={{ width: 500 }} />
      <br />
      Write a package that you want to check with Regex test:
      <br />
      <input value={packageToCheck} onChange={(e) => setPackageToCheck(e.target.value)} style={{ width: 500 }} />
      <br />
      <div style={{ backgroundColor: '#ededed', padding: 8 }}>
        regex exclude {packageToCheck} package: {regexResult.toString()}
      </div>
    </div>
  );
}
