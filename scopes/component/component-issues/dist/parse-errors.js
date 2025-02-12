"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParseErrors = void 0;
const component_issue_1 = require("./component-issue");
class ParseErrors extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'error found while parsing the file';
        this.solution = 'edit the file and fix the parsing error';
        this.data = {};
    }
}
exports.ParseErrors = ParseErrors;
//# sourceMappingURL=parse-errors.js.map