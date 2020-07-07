import { useRef } from 'react';

export const useChange = (value: any, handler: () => void) => {
  const ref = useRef(value);
  // const [prev, setPrev] = useState(value);
  // debugger;
  if (ref.current !== value) {
    console.log('value has changed');
    ref.current = value;
    handler();
  }
};
