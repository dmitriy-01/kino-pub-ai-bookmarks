import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConfigValidator } from './validator';

// Load environment variables from .env file
dotenv.config();

// Kino.pub API constants (hard-coded as per auth.js)
export const KINO_PUB_CONSTANTS = {
  CLIENT_ID: "xbmc",
  CLIENT_SECRET: "cgg3gtifu46urtfp2zp1nqtba0k2ezxh",
  API_URL: "https://api.srvkp.com/v1",
  OAUTH_URL: "https://api.srvkp.com/oauth2/device"
} as const;

export interface AppConfig {
  kinoPubApi: {
    clientId: string;
    clientSecret: string;
    apiUrl: string;
    oauthUrl: string;
  };
  aiProvider: 'openai' | 'local';
  openaiApiKey?: string;
  recommendationSettings: {
    maxRecommendations: number;
    minScore: number;
    updateFrequency: string;
  };
  browserSettings: {
    headless: boolean;
    timeout: number;
  };
}

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: AppConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  public loadConfig(): AppConfig {
    if (this.config) {
      return this.config;
    }

    this.config = {
      kinoPubApi: {
        clientId: KINO_PUB_CONSTANTS.CLIENT_ID,
        clientSecret: KINO_PUB_CONSTANTS.CLIENT_SECRET,
        apiUrl: KINO_PUB_CONSTANTS.API_URL,
        oauthUrl: KINO_PUB_CONSTANTS.OAUTH_URL,
      },
      aiProvider: (process.env.AI_PROVIDER as 'openai' | 'local') || 'openai',
      openaiApiKey: process.env.OPENAI_API_KEY,
      recommendationSettings: {
        maxRecommendations: parseInt(process.env.MAX_RECOMMENDATIONS || '10'),
        minScore: parseFloat(process.env.MIN_RECOMMENDATION_SCORE || '0.7'),
        updateFrequency: process.env.UPDATE_FREQUENCY || '0 9 * * *',
      },
      browserSettings: {
        headless: process.env.BROWSER_HEADLESS === 'true',
        timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000'),
      },
    };

    return this.config;
  }

  public getConfig(): AppConfig {
    if (!this.config) {
      return this.loadConfig();
    }
    return this.config;
  }
}

// Export a convenience function to get config
export const getConfig = (): AppConfig => {
  return ConfigLoader.getInstance().getConfig();
};