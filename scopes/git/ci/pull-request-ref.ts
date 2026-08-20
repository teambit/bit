export function isPullRequestRef(branchName: string): boolean {
  return /^pull\/\d+(?:\/(?:head|merge))?$/.test(branchName);
}
