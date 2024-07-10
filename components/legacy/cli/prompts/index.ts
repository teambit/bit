import prompt from './prompt';
import analyticsSchema from './schemas/analytics-reporting';
import errorReportingSchema from './schemas/error-reporting';
import resolveConflictSchema from './schemas/resolve-conflict';
import approveOperationSchema from './schemas/approve-operation';

const approveOperation = prompt(approveOperationSchema);
const resolveConflictPrompt = prompt(resolveConflictSchema);
const analyticsPrompt = prompt(analyticsSchema);
const errorReportingPrompt = prompt(errorReportingSchema);

export { approveOperation, resolveConflictPrompt, analyticsPrompt, errorReportingPrompt };
export { PromptCanceled } from './exceptions';
