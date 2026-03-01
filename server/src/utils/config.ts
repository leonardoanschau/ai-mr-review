/**
 * Configuration Manager
 * Reads and validates environment variables
 */

export interface GitLabConfig {
  token: string;
  apiUrl: string;
  defaultGroup: string;
  defaultAssignee: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class ConfigManager {
  private static validateRequired(value: string | undefined, name: string): string {
    if (!value || value.trim() === '') {
      throw new ConfigError(`${name} is required but not set in environment`);
    }
    return value.trim();
  }

  private static getOptional(value: string | undefined, defaultValue: string): string {
    return value?.trim() || defaultValue;
  }

  static getConfig(): GitLabConfig {
    return {
      token: this.validateRequired(process.env.GITLAB_TOKEN, 'GITLAB_TOKEN'),
      apiUrl: this.validateRequired(process.env.GITLAB_API_URL, 'GITLAB_API_URL'),
      defaultGroup: this.getOptional(process.env.GITLAB_DEFAULT_GROUP, ''),
      defaultAssignee: this.getOptional(process.env.GITLAB_DEFAULT_ASSIGNEE, ''),
    };
  }

  static validateConfig(): void {
    this.getConfig(); // Will throw if invalid
  }
}
