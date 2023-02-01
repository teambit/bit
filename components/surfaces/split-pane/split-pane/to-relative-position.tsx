import { limit } from './limit';

export function toRelativePosition({
  clientX,
  clientY,
  element,
}: {
  clientX: number;
  clientY: number;
  element: HTMLDivElement;
}) {
  const boundingRect = element.getBoundingClientRect();
  const { left, top, width = 1, height = 1 } = boundingRect;

  const x = limit(clientX - left, 0, width);
  const y = limit(clientY - top, 0, height);

  return {
    x,
    y,
    width,
    height,
  };
}
