export default function getColumnCount() {
  // the number on the right side is arbitrary and is mostly for non terminal environments
  return process.stdout.columns || 100;
}
