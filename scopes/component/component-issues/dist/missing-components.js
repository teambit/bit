"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingComponents = void 0;
const component_issue_1 = require("./component-issue");
class MissingComponents extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'missing components';
        this.solution = 'use "bit import" or `bit install` to make sure all components exist';
        this.data = {};
    }
    deserialize(data) {
        return (0, component_issue_1.deserializeWithBitId)(data);
    }
}
exports.MissingComponents = MissingComponents;
//# sourceMappingURL=missing-components.js.map