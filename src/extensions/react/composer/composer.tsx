import React, { useEffect, useState } from 'react';
import IO from 'socket.io-client';
import { Component } from './component';
import { Menu } from './menu';

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
      <Menu components={components} onClick={component => setActive(encodeParam(component))} />
      <iframe src={`/preview.html?component=${active}`}></iframe>
    </div>
  );
}

function encodeParam(component: Component): string {
  return btoa(JSON.stringify(component));
}
