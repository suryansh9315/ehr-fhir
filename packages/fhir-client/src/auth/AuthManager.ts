import jwt from 'jsonwebtoken';
import axios from 'axios';
import { v4 as uuid } from 'uuid';
import * as fs from 'fs';
import { createLogger } from '@ehr/shared';

const logger = createLogger('auth-manager');

export interface AuthConfig {
  authType: 'none' | 'smart';
  clientId?: string;
  privateKeyPath?: string;
  tokenUrl?: string;
}

interface TokenCache {
  token: string;
  expiresAt: number; // Unix milliseconds
}

export class AuthManager {
  private tokenCache: TokenCache | null = null;
  private privateKey: string | null = null;

  constructor(private config: AuthConfig) {
    if (config.authType === 'smart') {
      if (!config.clientId) throw new Error('FHIR_CLIENT_ID is required for SMART auth');
      if (!config.privateKeyPath) throw new Error('FHIR_PRIVATE_KEY_PATH is required for SMART auth');
      if (!config.tokenUrl) throw new Error('FHIR_TOKEN_URL is required for SMART auth');
      this.privateKey = fs.readFileSync(config.privateKeyPath, 'utf8');
      logger.info('SMART auth configured', { clientId: config.clientId });
    } else {
      logger.info('Auth type: none (open sandbox)');
    }
  }

  /**
   * Returns a valid Bearer token, refreshing when near-expiry.
   * Returns null for authType=none — caller omits Authorization header entirely.
   */
  async getToken(): Promise<string | null> {
    if (this.config.authType === 'none') return null;

    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    return this.refreshToken();
  }

  private async refreshToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    // JWT assertion per Epic's SMART backend services spec:
    // https://fhir.epic.com/Documentation?docId=oauth2&section=Backend-Oauth2
    const assertion = jwt.sign(
      {
        iss: this.config.clientId,
        sub: this.config.clientId,
        aud: this.config.tokenUrl,
        jti: uuid(),      // mandatory — Epic rejects assertions without jti
        exp: now + 300,   // 5-minute expiry
        nbf: now,
        iat: now,
      },
      this.privateKey!,
      { algorithm: 'RS384' } // Epic requires RS384; RS256 is rejected for backend services
    );

    logger.debug('Requesting SMART token', { clientId: this.config.clientId });

    const response = await axios.post(
      this.config.tokenUrl!,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type:
          'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const expiresIn: number = response.data.expires_in ?? 300;

    // Refresh 60s before actual expiry to avoid using an expired token mid-request
    this.tokenCache = {
      token: response.data.access_token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    };

    logger.info('SMART token acquired', { expiresIn });
    return this.tokenCache.token;
  }
}
