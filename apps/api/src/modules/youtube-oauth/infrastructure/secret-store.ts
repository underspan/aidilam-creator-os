/**
 * Secret Store Abstraction
 * AIDILAM-DEP-016A2
 *
 * Fail-closed secret management interface.
 * Only fake/test backend in this phase.
 * Production backend remains unconfigured.
 */

export interface SecretStore {
  putSecret(reference: string, value: string): Promise<void>;
  getSecret(reference: string): Promise<string | null>;
  rotateSecret(reference: string, newValue: string): Promise<void>;
  revokeSecret(reference: string): Promise<void>;
  deleteSecret(reference: string): Promise<void>;
  healthCheck(): Promise<boolean>;
}

/**
 * Fake/test SecretStore backend.
 * Stores secrets in memory only. Not for production.
 */
export class FakeSecretStore implements SecretStore {
  private store = new Map<string, string>();
  private available = true;

  async putSecret(reference: string, value: string): Promise<void> {
    this.requireAvailable();
    this.store.set(reference, value);
  }

  async getSecret(reference: string): Promise<string | null> {
    this.requireAvailable();
    return this.store.get(reference) ?? null;
  }

  async rotateSecret(reference: string, newValue: string): Promise<void> {
    this.requireAvailable();
    if (!this.store.has(reference)) throw new Error('Secret not found');
    this.store.set(reference, newValue);
  }

  async revokeSecret(reference: string): Promise<void> {
    this.requireAvailable();
    this.store.delete(reference);
  }

  async deleteSecret(reference: string): Promise<void> {
    this.requireAvailable();
    this.store.delete(reference);
  }

  async healthCheck(): Promise<boolean> {
    return this.available;
  }

  // Test helpers
  setUnavailable(): void { this.available = false; }
  setAvailable(): void { this.available = true; }
  clear(): void { this.store.clear(); }

  private requireAvailable(): void {
    if (!this.available) throw new Error('Secret store unavailable (fail-closed)');
  }
}

/**
 * Production SecretStore factory.
 * Returns null/throws if not configured — fail-closed.
 */
export function createProductionSecretStore(): SecretStore {
  // Production backend NOT configured in this phase
  throw new Error('Production secret store not configured. Real OAuth authorization is disabled.');
}

/**
 * Generate an opaque, non-reversible secret reference.
 */
export function generateSecretReference(prefix: string): string {
  const { randomBytes } = require('node:crypto');
  return `${prefix}:${randomBytes(16).toString('hex')}`;
}
