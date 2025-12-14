import crypto from 'crypto';

interface MagicLinkToken {
  email: string;
  token: string;
  expiresAt: Date;
  sessionId?: string; // To claim anonymous pages after auth
}

class AuthStore {
  private tokens: Map<string, MagicLinkToken> = new Map();
  private readonly TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

  generateToken(email: string, sessionId?: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.TOKEN_EXPIRY_MS);
    
    this.tokens.set(token, { email, token, expiresAt, sessionId });
    return token;
  }

  validateToken(token: string): MagicLinkToken | null {
    const record = this.tokens.get(token);
    if (!record) return null;
    
    if (new Date() > record.expiresAt) {
      this.tokens.delete(token);
      return null;
    }
    
    // Token is single-use
    this.tokens.delete(token);
    return record;
  }

  // Cleanup expired tokens periodically
  cleanup(): void {
    const now = new Date();
    for (const [token, record] of this.tokens) {
      if (now > record.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }
}

export const authStore = new AuthStore();

// Cleanup every 5 minutes
setInterval(() => authStore.cleanup(), 5 * 60 * 1000);

