/**
 * Secure storage utility using Electron safeStorage.
 * Stores sensitive data (API keys) encrypted using the OS keychain.
 * Replaces keytar (archived) with built-in Electron API.
 */

import { safeStorage } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { createLogger } from './logger';

const log = createLogger('SecureStorage');

// Storage directory for encrypted secrets
const SECRETS_DIR = path.join(app.getPath('userData'), 'secrets');

// In-memory cache for decrypted secrets
const secretsCache = new Map<string, string>();

/**
 * Ensure secrets directory exists.
 */
async function ensureSecretsDir(): Promise<void> {
  try {
    await fs.mkdir(SECRETS_DIR, { recursive: true });
  } catch (error) {
    log.error('Failed to create secrets directory', { error: String(error) });
    throw error;
  }
}

/**
 * Get the file path for a secret.
 */
function getSecretPath(key: string): string {
  // Sanitize key to prevent path traversal
  const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(SECRETS_DIR, `${sanitized}.enc`);
}

/**
 * Store a secret using Electron safeStorage.
 */
export async function setSecret(key: string, value: string): Promise<void> {
  try {
    await ensureSecretsDir();

    if (safeStorage.isEncryptionAvailable()) {
      // Encrypt and store
      const encrypted = safeStorage.encryptString(value);
      const filePath = getSecretPath(key);
      await fs.writeFile(filePath, encrypted);
      secretsCache.set(key, value);
      log.debug('Secret stored (encrypted)', { key });
    } else {
      // Fallback: store as base64 (not truly secure, but better than plain text)
      const encoded = Buffer.from(value).toString('base64');
      const filePath = getSecretPath(key);
      await fs.writeFile(filePath, encoded, 'utf-8');
      secretsCache.set(key, value);
      log.warn('Encryption not available, storing as base64', { key });
    }
  } catch (error) {
    log.error('Failed to store secret', { key, error: String(error) });
    throw error;
  }
}

/**
 * Retrieve a secret from secure storage.
 */
export async function getSecret(key: string): Promise<string | null> {
  try {
    // Check cache first
    if (secretsCache.has(key)) {
      return secretsCache.get(key) || null;
    }

    const filePath = getSecretPath(key);
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    if (!exists) {
      return null;
    }

    const data = await fs.readFile(filePath);

    if (safeStorage.isEncryptionAvailable()) {
      // Decrypt
      const decrypted = safeStorage.decryptString(data);
      secretsCache.set(key, decrypted);
      log.debug('Secret retrieved (decrypted)', { key });
      return decrypted;
    } else {
      // Fallback: decode base64
      const decoded = data.toString('utf-8');
      const value = Buffer.from(decoded, 'base64').toString('utf-8');
      secretsCache.set(key, value);
      log.debug('Secret retrieved (base64)', { key });
      return value;
    }
  } catch (error) {
    log.error('Failed to retrieve secret', { key, error: String(error) });
    return null;
  }
}

/**
 * Delete a secret from secure storage.
 */
export async function deleteSecret(key: string): Promise<boolean> {
  try {
    const filePath = getSecretPath(key);
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    if (!exists) {
      return false;
    }

    await fs.unlink(filePath);
    secretsCache.delete(key);
    log.debug('Secret deleted', { key });
    return true;
  } catch (error) {
    log.error('Failed to delete secret', { key, error: String(error) });
    return false;
  }
}

/**
 * Check if secure storage is available.
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * Migrate API keys from plain text to secure storage.
 */
export async function migrateApiKeys(settings: Record<string, string>): Promise<Record<string, string>> {
  const migrated = { ...settings };
  const apiKeyKeys = Object.keys(settings).filter(k => k.endsWith('_API_KEY'));

  for (const key of apiKeyKeys) {
    const value = settings[key];
    if (value && !value.startsWith('••••••••')) {
      try {
        await setSecret(key, value);
        migrated[key] = '••••••••'; // Mask in database
        log.info('Migrated API key to secure storage', { key });
      } catch (error) {
        log.warn('Failed to migrate API key, keeping in plain text', { key, error: String(error) });
      }
    }
  }

  return migrated;
}

/**
 * Retrieve API keys from secure storage, falling back to plain text.
 */
export async function getApiKeys(settings: Record<string, string>): Promise<Record<string, string>> {
  const result = { ...settings };
  const apiKeyKeys = Object.keys(settings).filter(k => k.endsWith('_API_KEY'));

  for (const key of apiKeyKeys) {
    const value = settings[key];
    if (value === '••••••••') {
      // Try to get from secure storage
      try {
        const secret = await getSecret(key);
        if (secret) {
          result[key] = secret;
        }
      } catch (error) {
        log.warn('Failed to retrieve API key from secure storage', { key, error: String(error) });
      }
    }
  }

  return result;
}
