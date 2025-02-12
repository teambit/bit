"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircularDependencies = void 0;
const component_issue_1 = require("./component-issue");
class CircularDependencies extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'circular dependencies';
        this.solution = 'run `bit insights "circular"` to get the component-ids participating in the circular';
        this.isTagBlocker = true;
    }
    outputForCLI() {
        return (0, component_issue_1.formatTitle)(this.descriptionWithSolution, false);
    }
}
exports.CircularDependencies = CircularDependencies;
//# sourceMappingURL=circular-dependencies.js.map