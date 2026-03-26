import fs from 'fs/promises';
import path from 'path';

interface AWSConfig {
  access_key_id: string;
  secret_access_key: string;
  session_token?: string;
  region: string;
  services: {
    s3: { bucket_name: string };
    ses: { from_email: string };
  };
}

interface JiraConfig {
  base_url: string;
  api_token: string;
  email: string;
  project_key: string;
  endpoints: {
    search: string;
    issue: string;
    comment: string;
  };
}

interface OpenRouterConfig {
  api_key: string;
  base_url: string;
  models: {
    primary: string;
    fallback: string;
  };
}

interface ApplicationConfig {
  name: string;
  version: string;
  environment: string;
  security: {
    session_secret: string;
    jwt_secret: string;
  };
}

interface FeatureConfig {
  enable_aws_integration: boolean;
  enable_jira_polling: boolean;
  enable_openrouter_ai: boolean;
  auto_resume_workflows: boolean;
  comment_polling_interval: number;
}

interface CredentialConfig {
  aws: AWSConfig;
  jira: JiraConfig;
  openrouter: OpenRouterConfig;
  application: ApplicationConfig;
  features: FeatureConfig;
}

class CredentialManager {
  private config: CredentialConfig | null = null;
  private configPath = path.join(process.cwd(), 'config', 'credentials.json');

  /**
   * Load credentials configuration directly from JSON (no environment variable substitution)
   */
  async loadCredentials(): Promise<CredentialConfig> {
    try {
      const configFile = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configFile) as CredentialConfig;
      
      console.log('[CredentialManager] Credentials loaded successfully from JSON');
      return this.config;
    } catch (error) {
      console.error('[CredentialManager] Failed to load credentials:', error);
      throw new Error('Failed to load credential configuration');
    }
  }

  /**
   * Update credentials in JSON file
   */
  async updateCredentials(updates: Partial<CredentialConfig>): Promise<void> {
    try {
      const currentConfig = await this.loadCredentials();
      const updatedConfig = { ...currentConfig, ...updates };
      
      await fs.writeFile(this.configPath, JSON.stringify(updatedConfig, null, 2), 'utf-8');
      this.config = updatedConfig; // Update cache
      
      console.log('[CredentialManager] Credentials updated successfully');
    } catch (error) {
      console.error('[CredentialManager] Failed to update credentials:', error);
      throw new Error('Failed to update credential configuration');
    }
  }

  /**
   * Get AWS credentials
   */
  async getAWSCredentials(): Promise<AWSConfig> {
    const config = await this.loadCredentials();
    return config.aws;
  }

  /**
   * Get Jira credentials
   */
  async getJiraCredentials(): Promise<JiraConfig> {
    const config = await this.loadCredentials();
    return config.jira;
  }

  /**
   * Get OpenRouter credentials
   */
  async getOpenRouterCredentials(): Promise<OpenRouterConfig> {
    const config = await this.loadCredentials();
    return config.openrouter;
  }

  /**
   * Get application configuration
   */
  async getApplicationConfig(): Promise<ApplicationConfig> {
    const config = await this.loadCredentials();
    return config.application;
  }

  /**
   * Get feature configuration
   */
  async getFeatureConfig(): Promise<FeatureConfig> {
    const config = await this.loadCredentials();
    return config.features;
  }

  /**
   * Validate that all required credentials are set in JSON
   */
  async validateCredentials(): Promise<{ valid: boolean; missing: string[] }> {
    try {
      const config = await this.loadCredentials();
      const missing: string[] = [];
      
      if (!config.aws.access_key_id || config.aws.access_key_id.includes('EXAMPLE')) {
        missing.push('AWS Access Key ID');
      }
      if (!config.aws.secret_access_key || config.aws.secret_access_key.includes('EXAMPLE')) {
        missing.push('AWS Secret Access Key');
      }
      if (!config.jira.api_token || config.jira.api_token.includes('...')) {
        missing.push('Jira API Token');
      }
      if (!config.openrouter.api_key || config.openrouter.api_key.includes('...')) {
        missing.push('OpenRouter API Key');
      }

      return {
        valid: missing.length === 0,
        missing
      };
    } catch (error) {
      return { valid: false, missing: ['Configuration file'] };
    }
  }

  /**
   * Create AWS SDK configuration object
   */
  async getAWSSDKConfig() {
    const aws = await this.getAWSCredentials();
    return {
      accessKeyId: aws.access_key_id,
      secretAccessKey: aws.secret_access_key,
      sessionToken: aws.session_token,
      region: aws.region
    };
  }

  /**
   * Create Jira API headers
   */
  async getJiraHeaders() {
    const jira = await this.getJiraCredentials();
    const auth = Buffer.from(`${jira.email}:${jira.api_token}`).toString('base64');
    
    return {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create OpenRouter API headers
   */
  async getOpenRouterHeaders() {
    const openrouter = await this.getOpenRouterCredentials();
    
    return {
      'Authorization': `Bearer ${openrouter.api_key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://exlservice.com',
      'X-Title': 'EXLerate AI Underwriting Platform'
    };
  }

  /**
   * Watch for changes in credentials file and auto-reload
   */
  watchForChanges(): void {
    try {
      require('fs').watchFile(this.configPath, (curr: any, prev: any) => {
        if (curr.mtime !== prev.mtime) {
          console.log('[CredentialManager] Configuration file changed, reloading...');
          this.config = null; // Clear cache to force reload
        }
      });
    } catch (error) {
      console.warn('[CredentialManager] File watching not available:', error);
    }
  }

  /**
   * Refresh configuration (reload from file)
   */
  async refreshCredentials(): Promise<CredentialConfig> {
    this.config = null;
    return await this.loadCredentials();
  }
}

// Export singleton instance
export const credentialManager = new CredentialManager();

// Export types
export type {
  AWSConfig,
  JiraConfig,
  OpenRouterConfig,
  ApplicationConfig,
  CredentialConfig
};