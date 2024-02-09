import prompt from './prompt';
import analyticsSchema from './schemas/analytics-reporting';
import errorReportingSchema from './schemas/error-reporting';
import removeSchema from './schemas/remote-remove';
import resolveConflictSchema from './schemas/resolve-conflict';
import approveOperationSchema from './schemas/approve-operation';

const approveOperation = prompt(approveOperationSchema);
const removePrompt = (deleteFiles: boolean, remote: boolean) => prompt(removeSchema(deleteFiles, remote));
const resolveConflictPrompt = prompt(resolveConflictSchema);
const analyticsPrompt = prompt(analyticsSchema);
const errorReportingPrompt = prompt(errorReportingSchema);

export { approveOperation, removePrompt, resolveConflictPrompt, analyticsPrompt, errorReportingPrompt };
