import React, { useEffect, useState } from 'react';
import IO from 'socket.io-client';

const io = IO.connect('http://localhost:4000');

export function Composer() {
  const [components, setComponents] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    io.on('components', raw => {
      setComponents(raw);
    });
  });

  return (
    <div>
      {components.join(', ')}
      <iframe src="/preview.html"></iframe>
    </div>
  );
}
