import React, { useEffect, useState } from 'react';
import IO from 'socket.io-client';
import { Component } from './component';
import { ComponentMenu } from './component-menu';

const io = IO.connect('http://localhost:4000');

export function Composer() {
  const [components, setComponents] = useState<Component[]>([]);
  const [active, setActive] = useState('');

  useEffect(() => {
    io.on('components', raw => {
      setComponents(raw);
      setActive(raw[0].id);
    });
  });

  return (
    <div>
      <div style={{ height: '100%' }}>
        <ComponentMenu components={components} onClick={component => setActive(encodeParam(component))} />
      </div>
      <iframe src={`/preview.html?component=${active}`} width="100%" frameBorder="0"></iframe>
    </div>
  );
}

function encodeParam(component: Component): string {
  return btoa(JSON.stringify(component));
}
