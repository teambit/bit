export function pipeOutput(childProcess, toPipe = process) {
  const { stdout, stderr } = childProcess;
  if (stdout) {
    stdout.pipe(toPipe.stdout);
  }
  if (stderr) {
    stderr.pipe(toPipe.stderr);
  }
}
