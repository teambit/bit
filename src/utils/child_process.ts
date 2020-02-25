export function pipeOutput(childProcess) {
  const { stdout, stderr } = childProcess;
  if (stdout) {
    stdout.pipe(process.stdout);
  }
  if (stderr) {
    stderr.pipe(process.stderr);
  }
}
