"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingDependenciesOnFs = void 0;
const component_issue_1 = require("./component-issue");
class MissingDependenciesOnFs extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'non-existing dependency files';
        this.solution = 'make sure all files exists on your workspace';
        this.data = {};
    }
}
exports.MissingDependenciesOnFs = MissingDependenciesOnFs;
//# sourceMappingURL=missing-dependencies-on-fs.js.map