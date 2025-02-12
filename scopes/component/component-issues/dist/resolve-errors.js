"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResolveErrors = void 0;
const component_issue_1 = require("./component-issue");
class ResolveErrors extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'error found while resolving the file dependencies';
        this.solution = 'see the log for the full error';
        this.data = {};
    }
}
exports.ResolveErrors = ResolveErrors;
//# sourceMappingURL=resolve-errors.js.map