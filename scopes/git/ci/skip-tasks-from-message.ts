/**
 * Parse an opt-in `[skip-tasks: <names>]` token out of a PR commit message. Lets a developer trade
 * specific build/publish tasks for speed on a single PR (e.g. `[skip-tasks: GeneratePreview]`)
 * without touching the CI config — `bit ci pr` runs the full pipeline by default and only skips what
 * the token names. Returns the parsed task names and the message with the token stripped (so the
 * token doesn't leak into the snap message). The keyword is case-insensitive; task names are matched
 * verbatim downstream against `task.name` / `task.aspectId`. Only the first token is honored.
 */
const SKIP_TASKS_TOKEN = /\[skip-tasks:\s*([^\]]+?)\s*\]/i;

export function extractSkipTasksFromMessage(message: string): { skipTasks: string[]; message: string } {
  const match = message.match(SKIP_TASKS_TOKEN);
  if (!match) return { skipTasks: [], message };
  const skipTasks = match[1]
    .split(',')
    .map((task) => task.trim())
    .filter(Boolean);
  const cleanedMessage = message
    .replace(match[0], '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return { skipTasks, message: cleanedMessage };
}
