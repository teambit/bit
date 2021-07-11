import React, { useEffect, useState, ComponentType } from 'react';
import { LoaderFallback } from './loader-fallback';

export const RegularComponent = () => {
  return <LoaderFallback Target={Component} DefaultComponent={Fallback} />;
};

export const UndefinedComponent = () => {
  return <LoaderFallback Target={undefined} DefaultComponent={Fallback} />;
};

export const ChangingComponent = () => {
  const [current, setCurrent] = useState<ComponentType | undefined>(() => Component);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrent((x?: ComponentType) => (x ? undefined : Component));
    }, 2000);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div style={{ width: 200, height: '3em' }}>
      <div style={{ fontSize: '0.8em' }}>(this will not timeout, and show only the loader)</div>
      <LoaderFallback Target={current} DefaultComponent={Fallback} />
    </div>
  );
};

export const LongChangingComponent = () => {
  const [current, setCurrent] = useState<ComponentType | undefined>(() => Component);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrent((x?: ComponentType) => (x ? undefined : Component));
    }, 6000);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div style={{ width: 200, height: '3em' }}>
      <div style={{ fontSize: '0.8em' }}>(this will timeout, showing the fallback component)</div>
      <LoaderFallback Target={current} DefaultComponent={Fallback} timeout={2000} />
    </div>
  );
};

function Component() {
  return <div style={{ color: '#2e945a' }}>✓ actual component</div>;
}

function Fallback() {
  return <div>target is (undefined)</div>;
}
