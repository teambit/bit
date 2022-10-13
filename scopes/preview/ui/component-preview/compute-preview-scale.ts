export function computePreviewScale(width: number, containerWidth: number) {
  const scale = (containerWidth * 0.95) / width;
  if (scale > 1) return `scale(1)`;

  return `scale(${scale})`;
}
