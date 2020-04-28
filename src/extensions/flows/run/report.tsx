/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { Color } from 'ink';

export function Report(info: any) {
  const results = Object.entries(info.props.value);
  if (!results.length) {
    return (
      <div>
        <Color magenta>No component flows executed.</Color>
      </div>
    );
  }
  return (
    <div>
      {results.map(([key, value]: [string, any], index) => {
        return (
          <div key={key}>
            <Color white>
              <Color rgb={value.result.code ? [255, 0, 0] : [0, 255, 0]}>{value.result.code ? '❌' : ' ✔️'}</Color>{' '}
              {key} ({Math.max(value.result.duration, 1)}ms).
            </Color>
          </div>
        );
      })}
    </div>
  );
}

function ResultCode(code: number) {
  return <span>is successful </span>;
}
