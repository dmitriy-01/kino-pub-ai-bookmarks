import axios, { AxiosResponse } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getConfig } from '../config';

export interface DeviceAuthResponse {
    code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
    expires_in: number;
}

export interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
}

export interface StoredTokens {
    accessToken: string;
    refreshToken: string;
    accessTokenExpire: number;
}

export class AuthenticationError extends Error {
    constructor(message: string, public code?: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class AuthenticationService {
    private config = getConfig();
    private tokenFilePath = path.join(process.cwd(), '.tokens', 'kinopub-tokens.json');
    private storedTokens: StoredTokens | null = null;

    /**
     * Check if user is currently authenticated with valid tokens
     */
    public isAuthenticated(): boolean {
        const tokens = this.loadStoredTokens();
        if (!tokens) {
            return false;
        }

        // Check if access token is still valid (with 5 minute buffer)
        const now = Date.now();
        const bufferTime = 5 * 60 * 1000; // 5 minutes
        return tokens.accessTokenExpire > (now + bufferTime);
    }

    /**
     * Get current access token, refreshing if necessary
     */
    public async getAccessToken(): Promise<string> {
        const tokens = this.loadStoredTokens();

        if (!tokens) {
            throw new AuthenticationError('No stored tokens found. Please authenticate first.');
        }

        // If token is still valid, return it
        if (this.isAuthenticated()) {
            return tokens.accessToken;
        }

        // Try to refresh the token
        try {
            const refreshedTokens = await this.refreshToken(tokens.refreshToken);
            return refreshedTokens.access_token;
        } catch (error) {
            throw new AuthenticationError('Failed to refresh token. Please re-authenticate.', 'TOKEN_REFRESH_FAILED');
        }
    }

    /**
     * Start the OAuth device flow authentication process
     */
    public async authenticate(): Promise<boolean> {
        try {
            console.log('Starting kino.pub authentication...');

            // Step 1: Request device authorization
            const deviceAuth = await this.requestDeviceAuthorization();

            console.log('\n=== AUTHENTICATION REQUIRED ===');
            console.log(`Please visit: ${deviceAuth.verification_uri}`);
            console.log(`Enter this code: ${deviceAuth.user_code}`);
            console.log('Waiting for authorization...\n');

            // Step 2: Poll for token
            const tokens = await this.pollForToken(deviceAuth);

            // Step 3: Store tokens
            this.storeTokens(tokens);

            console.log('✅ Authentication successful!');
            return true;

        } catch (error) {
            if (error instanceof AuthenticationError) {
                console.error(`❌ Authentication failed: ${error.message}`);
            } else {
                console.error('❌ Unexpected error during authentication:', error);
            }
            return false;
        }
    }

    /**
     * Refresh access token using refresh token
     */
    public async refreshSession(): Promise<boolean> {
        const tokens = this.loadStoredTokens();
        if (!tokens?.refreshToken) {
            return false;
        }

        try {
            const refreshedTokens = await this.refreshToken(tokens.refreshToken);
            this.storeTokens(refreshedTokens);
            return true;
        } catch (error) {
            console.error('Failed to refresh session:', error);
            return false;
        }
    }

    /**
     * Request device authorization from kino.pub
     */
    private async requestDeviceAuthorization(): Promise<DeviceAuthResponse> {
        try {
            const response: AxiosResponse<DeviceAuthResponse> = await axios.post(
                this.config.kinoPubApi.oauthUrl,
                {
                    grant_type: 'device_code',
                    client_id: this.config.kinoPubApi.clientId,
                    client_secret: this.config.kinoPubApi.clientSecret,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Kino.pub AI Bookmarks',
                    },
                    timeout: 10000,
                }
            );

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new AuthenticationError(
                    `Failed to request device authorization: ${error.response?.data?.error || error.message}`,
                    'DEVICE_AUTH_FAILED'
                );
            }
            throw new AuthenticationError('Network error during device authorization');
        }
    }

    /**
     * Poll for access token after user authorization
     */
    private async pollForToken(deviceAuth: DeviceAuthResponse): Promise<TokenResponse> {
        const maxAttempts = 120; // ~5 minutes with 2.5s intervals
        const pollInterval = Math.max(deviceAuth.interval * 1000, 2500); // At least 2.5 seconds

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response: AxiosResponse<TokenResponse> = await axios.post(
                    this.config.kinoPubApi.oauthUrl,
                    {
                        grant_type: 'device_token',
                        client_id: this.config.kinoPubApi.clientId,
                        client_secret: this.config.kinoPubApi.clientSecret,
                        code: deviceAuth.code,
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Kino.pub AI Bookmarks',
                        },
                        timeout: 10000,
                    }
                );

                return response.data;

            } catch (error) {
                if (axios.isAxiosError(error)) {
                    const errorCode = error.response?.data?.error;

                    if (errorCode === 'authorization_pending') {
                        // User hasn't authorized yet, continue polling
                        process.stdout.write('.');
                        await this.sleep(pollInterval);
                        continue;
                    }

                    if (errorCode === 'code_expired') {
                        throw new AuthenticationError('Authorization code expired. Please try again.', 'CODE_EXPIRED');
                    }

                    throw new AuthenticationError(
                        `Token request failed: ${error.response?.data?.error_description || error.message}`,
                        'TOKEN_REQUEST_FAILED'
                    );
                }

                throw new AuthenticationError('Network error during token polling');
            }
        }

        throw new AuthenticationError('Authentication timeout. Please try again.', 'TIMEOUT');
    }

    /**
     * Refresh access token using refresh token
     */
    private async refreshToken(refreshToken: string): Promise<TokenResponse> {
        try {
            const response: AxiosResponse<TokenResponse> = await axios.post(
                this.config.kinoPubApi.oauthUrl,
                {
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: this.config.kinoPubApi.clientId,
                    client_secret: this.config.kinoPubApi.clientSecret,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Kino.pub AI Bookmarks',
                    },
                    timeout: 10000,
                }
            );

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new AuthenticationError(
                    `Token refresh failed: ${error.response?.data?.error || error.message}`,
                    'TOKEN_REFRESH_FAILED'
                );
            }
            throw new AuthenticationError('Network error during token refresh');
        }
    }

    /**
     * Load stored tokens from file
     */
    private loadStoredTokens(): StoredTokens | null {
        if (this.storedTokens) {
            return this.storedTokens;
        }

        try {
            if (!fs.existsSync(this.tokenFilePath)) {
                return null;
            }

            const tokenData = fs.readFileSync(this.tokenFilePath, 'utf8');
            this.storedTokens = JSON.parse(tokenData);
            return this.storedTokens;
        } catch (error) {
            console.warn('Failed to load stored tokens:', error);
            return null;
        }
    }

    /**
     * Store tokens to file
     */
    private storeTokens(tokens: TokenResponse): void {
        const expirationTime = Date.now() + (tokens.expires_in * 1000);

        const storedTokens: StoredTokens = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            accessTokenExpire: expirationTime,
        };

        try {
            // Ensure the .tokens directory exists
            const tokenDir = path.dirname(this.tokenFilePath);
            if (!fs.existsSync(tokenDir)) {
                fs.mkdirSync(tokenDir, { recursive: true });
            }

            fs.writeFileSync(this.tokenFilePath, JSON.stringify(storedTokens, null, 2));
            this.storedTokens = storedTokens;
            console.log(`Tokens stored to: ${this.tokenFilePath}`);
        } catch (error) {
            throw new AuthenticationError(`Failed to store tokens: ${error}`);
        }
    }

    /**
     * Utility function to sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}