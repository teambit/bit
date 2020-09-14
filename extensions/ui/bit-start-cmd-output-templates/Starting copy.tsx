import React, { useState, useEffect } from 'react';
import { Color } from 'ink';
import Spinner from 'ink-spinner';

export const Starting = () => {
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCounter((previousCounter) => previousCounter + 1);
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return <Color white>{counter} tests passed</Color>;
};
