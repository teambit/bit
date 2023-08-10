import React, { useState, useEffect } from 'react';
import { PatternTarget, generateNodeModulesPattern } from './generate-node-modules-pattern';

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
  const [excludeComponents, setExcludeComponents] = useState(false);
  const [defaultCalculatedRegex, setDefaultCalculatedRegex] = useState('');
  const [webpackCalculatedRegexps, setWebpackCalculatedRegexps] = useState([]);
  const [defaultRegexResult, setDefaultRegexResult] = useState(true);
  const [webpackRegexResult, setWebpackRegexResult] = useState(true);

  useEffect(() => {
    const pattern = generateNodeModulesPattern({ packages: packagesToExclude.split(','), excludeComponents }) as string;
    const webpackPatterns = generateNodeModulesPattern({
      packages: packagesToExclude.split(','),
      excludeComponents,
      target: PatternTarget.WEBPACK,
    });
    setDefaultCalculatedRegex(pattern);
    // @ts-ignore
    setWebpackCalculatedRegexps(webpackPatterns);
    const regex = new RegExp(pattern);
    const webpackRegexps = webpackPatterns.map((webpackPattern) => new RegExp(webpackPattern));
    setDefaultRegexResult(regex.test(`node_modules/${packageToCheck}/some-path`));
    setWebpackRegexResult(
      webpackRegexps.every((webpackRegex) =>
        webpackRegex.test(`Users/aUser/workspace-a/node_modules/${packageToCheck}/package.json`)
      )
    );
  }, [packagesToExclude, packageToCheck, excludeComponents]);

  return (
    <div style={{ width: 500 }}>
      <div>Live example, write packages to exclude separate with a comma:</div>
      <input
        value={packagesToExclude}
        onChange={(e) => setPackagesToExclude(e.target.value)}
        style={{ width: 300, marginBottom: 12 }}
      />
      <div>Exclude components:</div>
      <input type="checkbox" checked={excludeComponents} onChange={(e) => setExcludeComponents(e.target.checked)} />

      <section>
        <h3>Default target (Jest)</h3>
        <div>Write a package that you want to check with Regex test:</div>
        <div style={{ marginBottom: 12 }}>
          <input value="node_modules/" disabled />
          <input value={packageToCheck} onChange={(e) => setPackageToCheck(e.target.value)} />
          <input value="/some-path" disabled />
        </div>
        <div style={{ backgroundColor: '#ededed', padding: 8 }}>
          regex exclude {packageToCheck} excludeComponents: {excludeComponents.toString()}
          <br />
          regex: {defaultCalculatedRegex}
          <br />
          result: {defaultRegexResult.toString()}
        </div>
      </section>
      <section>
        <h3>Target Webpack</h3>
        <div>Write a package that you want to check with Regex test:</div>
        <div style={{ marginBottom: 12 }}>
          <input value="Users/aUser/workspace-a/node_modules/" disabled />
          <input value={packageToCheck} onChange={(e) => setPackageToCheck(e.target.value)} />
          <input value="/package.json" disabled />
        </div>
        <div style={{ backgroundColor: '#ededed', padding: 8 }}>
          regex exclude {packageToCheck} excludeComponents: {excludeComponents.toString()}
          <br />
          regex: {webpackCalculatedRegexps}
          <br />
          result: {webpackRegexResult.toString()}
        </div>
      </section>
    </div>
  );
}
