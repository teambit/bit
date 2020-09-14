import React, { useState, useEffect } from 'react';
import { render, Color } from 'ink';

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

// render(<Counter />);
