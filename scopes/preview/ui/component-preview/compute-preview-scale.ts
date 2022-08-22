
export function computePreviewScale(width: number) {
  const containerWidth = 222;
  const scale = (containerWidth / width);
  if (scale > 1) return `scale(1)`;

  return `scale(${scale})`;
}