export type SpecMap = Record<string, SpecField>;

export type SpecField = {
  type?: string;
  types?: string[];
  required?: boolean;
  warning?: boolean;
  recommended?: boolean;
  format?: RegExp;
  validate?: (name: string, value: any) => string[];
  or?: string;
};

export type ValidationResult = {
  valid: boolean;
  critical?: string;
  errors?: string[];
  warnings?: string[];
  recommendations?: string[];
};

export const Formats = {
  packageFormat: /^[a-zA-Z0-9@\/][a-zA-Z0-9@\/\.\-_]*$/,
  versionFormat: /^[0-9]+\.[0-9]+[0-9+a-zA-Z\.\-]+$/,
  urlFormat: /^https*:\/\/[a-z.\-0-9]+/,
  emailFormat: /\S+@\S+/,
};

export type ValidationOptions = {
  warnings?: boolean;
  recommendations?: boolean;
};

export class PackageJsonValidator {
  static validate(data: string, specName: string = 'npm', options: ValidationOptions = {}): ValidationResult {
    let parsed: any;
    try {
      parsed = this.parse(data);
    } catch (error: any) {
      return { valid: false, critical: `Invalid JSON - ${error.toString()}` };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { valid: false, critical: 'Invalid JSON - not an object' };
    }

    const specs = this.getSpecMap(specName);

    if (!specs) {
      return { valid: false, critical: `Invalid specification name: ${specName}` };
    }

    const map = specs[specName];
    if (!map) {
      return { valid: false, critical: `Invalid specification: ${specName}` };
    }

    let errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    Object.keys(map).forEach((name) => {
      const field = map[name];
      const fieldValue = parsed[name];

      if (fieldValue === undefined && (!field.or || (field.or && parsed[field.or] === undefined))) {
        if (field.required) {
          errors.push(`Missing required field: ${name}`);
        } else if (field.warning) {
          warnings.push(`Missing recommended field: ${name}`);
        } else if (field.recommended) {
          recommendations.push(`Missing optional field: ${name}`);
        }
        return;
      }

      if (fieldValue === undefined) {
        return;
      }

      if (field.types || field.type) {
        const typeErrors = PackageJsonValidator.validateType(name, field, fieldValue);
        if (typeErrors.length > 0) {
          errors = errors.concat(typeErrors);
          return;
        }
      }

      if (field.format && !field.format.test(fieldValue)) {
        errors.push(`Value for field ${name}, ${fieldValue} does not match format: ${field.format}`);
      }

      if (typeof field.validate === 'function') {
        const validationErrors = field.validate(name, fieldValue);
        errors = errors.concat(validationErrors);
      }
    });

    const result: ValidationResult = { valid: errors.length === 0 };
    if (errors.length > 0) {
      result.errors = errors;
    }
    if (options.warnings !== false && warnings.length > 0) {
      result.warnings = warnings;
    }
    if (options.recommendations !== false && recommendations.length > 0) {
      result.recommendations = recommendations;
    }

    return result;
  }

  private static parse(data: string): any {
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return `Invalid JSON - not an object: ${typeof parsed}`;
      }
      return parsed;
    } catch (e: any) {
      return `Invalid JSON - ${e.message}`;
    }
  }

  static getSpecMap(specName: string): SpecMap | null {
    const specs: { [key: string]: SpecMap } = {
      npm: {
        name: { type: 'string', required: true, format: Formats.packageFormat },
        version: { type: 'string', required: true, format: Formats.versionFormat },
        description: { type: 'string', warning: true },
        keywords: { type: 'array', warning: true },
        homepage: { type: 'string', recommended: true, format: Formats.urlFormat },
        bugs: { warning: true, validate: this.validateUrlOrMailto },
        licenses: { type: 'array', warning: true, validate: this.validateUrlTypes, or: 'license' },
        license: { type: 'string' },
        author: { warning: true, validate: this.validatePeople },
        contributors: { warning: true, validate: this.validatePeople },
        files: { type: 'array' },
        main: { type: 'string' },
        bin: { types: ['string', 'object'] },
        man: { types: ['string', 'array'] },
        directories: { type: 'object' },
        repository: { types: ['string', 'object'], warning: true, validate: this.validateUrlTypes, or: 'repositories' },
        scripts: { type: 'object' },
        config: { type: 'object' },
        dependencies: { type: 'object', recommended: true, validate: this.validateDependencies },
        devDependencies: { type: 'object', validate: this.validateDependencies },
        bundledDependencies: { type: 'array' },
        bundleDependencies: { type: 'array' },
        optionalDependencies: { type: 'object', validate: this.validateDependencies },
        engines: { type: 'object', recommended: true },
        engineStrict: { type: 'boolean' },
        os: { type: 'array' },
        cpu: { type: 'array' },
        preferGlobal: { type: 'boolean' },
        private: { type: 'boolean' },
        publishConfig: { type: 'object' },
      },
      'commonjs_1.0': {
        name: { type: 'string', required: true, format: Formats.packageFormat },
        description: { type: 'string', required: true },
        version: { type: 'string', required: true, format: Formats.versionFormat },
        keywords: { type: 'array', required: true },
        maintainers: { type: 'array', required: true, validate: this.validatePeople },
        contributors: { type: 'array', required: true, validate: this.validatePeople },
        bugs: { type: 'string', required: true, validate: this.validateUrlOrMailto },
        licenses: { type: 'array', required: true, validate: this.validateUrlTypes },
        repositories: { type: 'object', required: true, validate: this.validateUrlTypes },
        dependencies: { type: 'object', required: true, validate: this.validateDependencies },
        homepage: { type: 'string', format: Formats.urlFormat },
        os: { type: 'array' },
        cpu: { type: 'array' },
        engine: { type: 'array' },
        builtin: { type: 'boolean' },
        directories: { type: 'object' },
        implements: { type: 'array' },
        scripts: { type: 'object' },
        checksums: { type: 'object' },
      },
      'commonjs_1.1': {
        name: { type: 'string', required: true, format: Formats.packageFormat },
        version: { type: 'string', required: true, format: Formats.versionFormat },
        main: { type: 'string', required: true },
        directories: { type: 'object', required: true },
        maintainers: { type: 'array', warning: true, validate: this.validatePeople },
        description: { type: 'string', warning: true },
        licenses: { type: 'array', warning: true, validate: this.validateUrlTypes },
        bugs: { type: 'string', warning: true, validate: this.validateUrlOrMailto },
        keywords: { type: 'array' },
        repositories: { type: 'array', validate: this.validateUrlTypes },
        contributors: { type: 'array', validate: this.validatePeople },
        dependencies: { type: 'object', validate: this.validateDependencies },
        homepage: { type: 'string', warning: true, format: Formats.urlFormat },
        os: { type: 'array' },
        cpu: { type: 'array' },
        engine: { type: 'array' },
        builtin: { type: 'boolean' },
        implements: { type: 'array' },
        scripts: { type: 'object' },
        overlay: { type: 'object' },
        checksums: { type: 'object' },
      },
    };

    return specs[specName] || null;
  }

  static validateUrlOrMailto(name: string, obj: any): string[] {
    const errors: string[] = [];
    if (typeof obj === 'string') {
      if (!Formats.urlFormat.test(obj) && !Formats.emailFormat.test(obj)) {
        errors.push(`${name} should be an email or a url`);
      }
    } else if (typeof obj === 'object') {
      if (!obj.email && !obj.url && !obj.mail && !obj.web) {
        errors.push(`${name} field should have one of: email, url, mail, web`);
      } else {
        if (obj.email && !Formats.emailFormat.test(obj.email)) {
          errors.push(`Email not valid for ${name}: ${obj.email}`);
        }
        if (obj.mail && !Formats.emailFormat.test(obj.mail)) {
          errors.push(`Email not valid for ${name}: ${obj.mail}`);
        }
        if (obj.url && !Formats.urlFormat.test(obj.url)) {
          errors.push(`Url not valid for ${name}: ${obj.url}`);
        }
        if (obj.web && !Formats.urlFormat.test(obj.web)) {
          errors.push(`Url not valid for ${name}: ${obj.web}`);
        }
      }
    } else {
      errors.push(`Type for field ${name} should be a string or an object`);
    }
    return errors;
  }

  static validatePeople(name: string, obj: any): string[] {
    const errors: string[] = [];

    function validatePerson(person: any) {
      if (typeof person === 'string') {
        const authorRegex = /^([^<\(\s]+[^<\(]*)?(\s*<(.*?)>)?(\s*\((.*?)\))?/;
        const authorFields = authorRegex.exec(person);
        if (authorFields) {
          const authorName = authorFields[1];
          const authorEmail = authorFields[3];
          const authorUrl = authorFields[5];
          validatePerson({ name: authorName, email: authorEmail, url: authorUrl });
        }
      } else if (typeof person === 'object') {
        if (!person.name) {
          errors.push(`${name} field should have name`);
        }
        if (person.email && !Formats.emailFormat.test(person.email)) {
          errors.push(`Email not valid for ${name}: ${person.email}`);
        }
        if (person.url && !Formats.urlFormat.test(person.url)) {
          errors.push(`Url not valid for ${name}: ${person.url}`);
        }
        if (person.web && !Formats.urlFormat.test(person.web)) {
          errors.push(`Url not valid for ${name}: ${person.web}`);
        }
      } else {
        errors.push('People field must be an object or a string');
      }
    }

    if (Array.isArray(obj)) {
      obj.forEach((person) => validatePerson(person));
    } else {
      validatePerson(obj);
    }
    return errors;
  }

  static validateDependencies(name: string, deps: { [key: string]: string }): string[] {
    const errors: string[] = [];
    Object.keys(deps).forEach((pkg) => {
      if (!Formats.packageFormat.test(pkg)) {
        errors.push(`Invalid dependency package name: ${pkg}`);
      }
      if (!PackageJsonValidator.isValidVersionRange(deps[pkg])) {
        errors.push(`Invalid version range for dependency ${pkg}: ${deps[pkg]}`);
      }
    });
    return errors;
  }

  static isValidVersionRange(version: string): boolean {
    return (
      /^[\^<>=~]{0,2}[0-9.x]+/.test(version) ||
      Formats.urlFormat.test(version) ||
      version === '*' ||
      version === '' ||
      version === 'latest' ||
      version.startsWith('git')
    );
  }

  static validateUrlTypes(name: string, obj: any): string[] {
    const errors: string[] = [];

    function validateUrlType(item: any) {
      if (!item.type) {
        errors.push(`${name} field should have type`);
      }
      if (!item.url) {
        errors.push(`${name} field should have url`);
      }
      if (item.url && !Formats.urlFormat.test(item.url)) {
        errors.push(`Url not valid for ${name}: ${item.url}`);
      }
    }

    if (typeof obj === 'string') {
      if (!Formats.urlFormat.test(obj)) {
        errors.push(`Url not valid for ${name}: ${obj}`);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item) => validateUrlType(item));
    } else if (typeof obj === 'object') {
      validateUrlType(obj);
    } else {
      errors.push(`Type for field ${name} should be a string or an object`);
    }

    return errors;
  }

  static validateType(name: string, field: { types?: string[]; type?: string }, value: any): string[] {
    const errors: string[] = [];
    const validFieldTypes = field.types || [field.type];
    const valueType = Array.isArray(value) ? 'array' : typeof value;
    if (!validFieldTypes.includes(valueType)) {
      errors.push(`Type for field ${name} was expected to be ${validFieldTypes.join(' or ')}, not ${valueType}`);
    }
    return errors;
  }
}
