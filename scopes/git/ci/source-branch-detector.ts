import type { Logger } from '@teambit/logger';
import { git } from './git';

/**
 * Utility class for detecting source branch names in CI environments after PR merge.
 *
 * **Core Challenge**: When `bit ci merge` runs on CI after a PR is merged, the current
 * branch is main/master, but we need to identify which branch was just merged in order
 * to delete the corresponding Bit lane. CI environment variables like GITHUB_HEAD_REF
 * are only available during pull_request events, not push events after merge.
 *
 * **Solution Strategy**:
 * 1. GitHub API - Query PR information using current commit SHA (works post-merge)
 * 2. Commit message parsing - Extract branch names from merge commit messages
 * 3. Multi-platform repository detection - Works across GitHub Actions, CircleCI, etc.
 *
 * This enables automatic lane cleanup even when CI runs on main branch after merge.
 */
export class SourceBranchDetector {
  constructor(private logger: Logger) {}

  /**
   * Determines which branch was just merged into main/master in CI environments.
   *
   * **Use Case**: When CI runs `bit ci merge` after a PR merge, we're on main branch
   * but need to identify the source branch to delete its corresponding Bit lane.
   *
   * **Detection Methods** (in order of preference):
   * 1. GitHub API - Most reliable for GitHub repos (works with/without token)
   * 2. Commit message parsing - Universal fallback for all Git platforms
   *
   * @param commitSha - Optional commit SHA to query (if not provided, uses current HEAD)
   * @returns The source branch name that was merged, or null if undetectable
   * @example
   * ```typescript
   * const detector = new SourceBranchDetector(logger);
   * const branch = await detector.getSourceBranchName();
   * // Returns: "feature/new-component" (the branch that was just merged)
   * ```
   */
  async getSourceBranchName(commitSha?: string): Promise<string | null> {
    try {
      // Primary approach: GitHub API - query PR info from current commit SHA
      // This is the most reliable method for GitHub repositories
      const githubBranch = await this.getSourceBranchFromGitHubAPI(commitSha);
      if (githubBranch) {
        return githubBranch;
      }

      // Fallback: parse from git commit message (works universally)
      // This handles GitLab, Azure DevOps, and other platforms
      const commitMessage = await this.getGitCommitMessage(commitSha);
      if (commitMessage) {
        // Pattern: "Merge pull request #123 from user/branch-name"
        const mergePattern = /Merge pull request #\d+ from [^/]+\/(.+)/;
        const match = commitMessage.match(mergePattern);
        if (match) {
          const branchName = match[1];
          this.logger.console(`Found source branch from merge commit message: ${branchName}`);
          return branchName;
        }

        // Pattern: "Merge branch 'branch-name' into main"
        const directMergePattern = /Merge branch '([^']+)'/;
        const directMatch = commitMessage.match(directMergePattern);
        if (directMatch && directMatch[1] !== 'main' && directMatch[1] !== 'master') {
          const branchName = directMatch[1];
          this.logger.console(`Found source branch from direct merge commit: ${branchName}`);
          return branchName;
        }

        // Pattern: "Merge remote-tracking branch 'origin/branch-name'"
        const remoteTrackingPattern = /Merge remote-tracking branch 'origin\/([^']+)'/;
        const remoteMatch = commitMessage.match(remoteTrackingPattern);
        if (remoteMatch && remoteMatch[1] !== 'main' && remoteMatch[1] !== 'master') {
          const branchName = remoteMatch[1];
          this.logger.console(`Found source branch from remote tracking merge: ${branchName}`);
          return branchName;
        }

        // GitLab-specific pattern: "Merge branch 'feature-branch' into 'main'"
        const gitlabMergePattern = /Merge branch '([^']+)' into '[^']+'/;
        const gitlabMatch = commitMessage.match(gitlabMergePattern);
        if (gitlabMatch && gitlabMatch[1] !== 'main' && gitlabMatch[1] !== 'master') {
          const branchName = gitlabMatch[1];
          this.logger.console(`Found source branch from GitLab merge commit: ${branchName}`);
          return branchName;
        }
      }

      this.logger.console('Unable to determine source branch name from API or git commit history');
      return null;
    } catch (e: any) {
      this.logger.console(`Error determining source branch name: ${e.toString()}`);
      return null;
    }
  }

  /**
   * Uses GitHub API to get pull request information from the current commit SHA.
   * This works even when running on push events after PR merge.
   * Enhanced to work with CircleCI and open source repos without tokens.
   */
  private async getSourceBranchFromGitHubAPI(commitSha?: string): Promise<string | null> {
    try {
      // Try to get GitHub repository info from environment or git remote
      const githubRepository = await this.getGitHubRepository();
      if (!githubRepository) {
        this.logger.console('Not a GitHub repository, skipping GitHub API approach');
        return null;
      }

      // Get commit SHA - use provided one or current HEAD
      const targetCommit = commitSha || (await git.revparse(['HEAD']));
      if (!targetCommit) {
        this.logger.console('Unable to get commit SHA');
        return null;
      }

      this.logger.console(`Querying GitHub API for PR info using commit SHA: ${targetCommit.trim()}`);

      // Query GitHub API for pull requests associated with this commit
      const apiUrl = `https://api.github.com/repos/${githubRepository}/commits/${targetCommit.trim()}/pulls`;

      // Try with token first (if available), then without token for public repos
      const githubToken = process.env.GITHUB_TOKEN;
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };

      if (githubToken) {
        headers.Authorization = `Bearer ${githubToken}`;
        this.logger.console('Using GitHub token for API request');
      } else {
        this.logger.console('No GitHub token found, attempting public API access');
      }

      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          if (!githubToken) {
            this.logger.console(
              `GitHub API request failed (${response.status}): Repository may be private. Please set GITHUB_TOKEN environment variable.`
            );
          } else {
            this.logger.console(
              `GitHub API request failed (${response.status}): Token may be invalid or insufficient permissions`
            );
          }
        } else {
          this.logger.console(`GitHub API request failed: ${response.status} ${response.statusText}`);
        }
        return null;
      }

      const pullRequests = await response.json();

      if (pullRequests && pullRequests.length > 0) {
        // Get the first (most recent) PR that contains this commit
        const pr = pullRequests[0];
        const sourceBranch = pr.head.ref;
        this.logger.console(`Found source branch from GitHub API: ${sourceBranch} (PR #${pr.number})`);
        return sourceBranch;
      } else {
        this.logger.console('No pull requests found for current commit SHA');
        return null;
      }
    } catch (e: any) {
      this.logger.console(`Error querying GitHub API: ${e.toString()}`);
      return null;
    }
  }

  /**
   * Attempts to determine the GitHub repository (owner/repo) from environment variables
   * or by parsing the git remote origin URL. Works across different CI platforms.
   */
  private async getGitHubRepository(): Promise<string | null> {
    try {
      // First, try environment variables (GitHub Actions)
      if (process.env.GITHUB_REPOSITORY) {
        this.logger.console(`Found GitHub repository from GITHUB_REPOSITORY: ${process.env.GITHUB_REPOSITORY}`);
        return process.env.GITHUB_REPOSITORY;
      }

      // CircleCI provides repository info in different format
      if (process.env.CIRCLE_PROJECT_USERNAME && process.env.CIRCLE_PROJECT_REPONAME) {
        const repo = `${process.env.CIRCLE_PROJECT_USERNAME}/${process.env.CIRCLE_PROJECT_REPONAME}`;
        this.logger.console(`Found GitHub repository from CircleCI: ${repo}`);
        return repo;
      }

      // Fallback: parse from git remote origin URL
      this.logger.console('Attempting to extract GitHub repository from git remote origin');
      const remoteUrl = await git.raw(['config', '--get', 'remote.origin.url']);

      if (remoteUrl) {
        const trimmedUrl = remoteUrl.trim();

        // Match GitHub URLs in various formats:
        // https://github.com/owner/repo.git
        // git@github.com:owner/repo.git
        // https://github.com/owner/repo
        const githubPatterns = [/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?/, /github\.com\/([^/]+)\/([^/.]+)/];

        for (const pattern of githubPatterns) {
          const match = trimmedUrl.match(pattern);
          if (match) {
            const repo = `${match[1]}/${match[2]}`;
            this.logger.console(`Extracted GitHub repository from git remote: ${repo}`);
            return repo;
          }
        }
      }

      this.logger.console('Unable to determine GitHub repository from environment or git remote');
      return null;
    } catch (e: any) {
      this.logger.console(`Error determining GitHub repository: ${e.toString()}`);
      return null;
    }
  }

  /**
   * Gets the git commit message for the specified commit
   */
  private async getGitCommitMessage(commitSha?: string): Promise<string | null> {
    try {
      const logOptions: any = { maxCount: 1 };
      if (commitSha) {
        logOptions.from = commitSha;
        logOptions.to = commitSha;
      }

      const commit = await git.log(logOptions);
      if (!commit.latest) {
        return null;
      }
      const { message, body } = commit.latest;
      return body ? `${message}\n\n${body}` : message;
    } catch (e: any) {
      this.logger.console(`Unable to read commit message: ${e.toString()}`);
      return null;
    }
  }
}
