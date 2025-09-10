import { AppConfig } from './index';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ConfigValidator {
  public static validate(config: AppConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate AI provider settings
    if (config.aiProvider === 'openai' && !config.openaiApiKey) {
      warnings.push('OPENAI_API_KEY is not set. AI recommendations may not work properly.');
    }

    // Validate recommendation settings
    if (config.recommendationSettings.maxRecommendations <= 0) {
      errors.push('MAX_RECOMMENDATIONS must be a positive number.');
    }

    if (config.recommendationSettings.minScore < 0 || config.recommendationSettings.minScore > 1) {
      errors.push('MIN_RECOMMENDATION_SCORE must be between 0 and 1.');
    }

    // Validate browser settings
    if (config.browserSettings.timeout <= 0) {
      errors.push('BROWSER_TIMEOUT must be a positive number.');
    }

    // Validate cron expression format (basic validation)
    const cronPattern = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
    if (!cronPattern.test(config.recommendationSettings.updateFrequency)) {
      warnings.push('UPDATE_FREQUENCY should be a valid cron expression (e.g., "0 9 * * *" for daily at 9 AM).');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  public static validateAndThrow(config: AppConfig): void {
    const result = this.validate(config);
    
    if (!result.isValid) {
      const errorMessage = [
        'Configuration validation failed:',
        ...result.errors.map(error => `  - ${error}`),
        '',
        'Please check your .env file and ensure all values are properly configured.',
        'You can use .env.example as a template.',
      ].join('\n');
      
      throw new Error(errorMessage);
    }

    // Log warnings if any
    if (result.warnings.length > 0) {
      console.warn('Configuration warnings:');
      result.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
  }
}