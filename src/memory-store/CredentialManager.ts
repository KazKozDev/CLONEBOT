/**
 * Credential Manager
 * Безопасное хранение токенов и секретов
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { CredentialEntry } from './types';

/**
 * Простое шифрование для credentials
 * В продакшене использовать более надежные решения (keytar, node-keychain)
 */
export class CredentialManager {
  private credentials: Map<string, CredentialEntry> = new Map();
  private credentialsFile: string;
  private encryptionKey: Buffer;

  constructor(
    workspaceDir: string,
    private masterPassword?: string
  ) {
    this.credentialsFile = path.join(workspaceDir, 'credentials', 'store.json');
    
    // Генерировать ключ шифрования из мастер-пароля
    this.encryptionKey = this.deriveKey(masterPassword || 'default-key-change-me');
  }

  /**
   * Загрузить credentials из файла
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.credentialsFile, 'utf-8');
      const data = JSON.parse(content);
      
      this.credentials.clear();
      for (const [key, entry] of Object.entries(data)) {
        const credEntry = entry as CredentialEntry;
        
        // Расшифровать если зашифровано
        if (credEntry.encrypted) {
          credEntry.value = this.decrypt(credEntry.value);
        }
        
        this.credentials.set(key, credEntry);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Файл не существует - это нормально при первом запуске
    }
  }

  /**
   * Сохранить credentials в файл
   */
  async save(): Promise<void> {
    // Убедиться что директория существует
    await fs.mkdir(path.dirname(this.credentialsFile), { recursive: true });
    
    const data: Record<string, CredentialEntry> = {};
    
    for (const [key, entry] of this.credentials.entries()) {
      // Шифровать значение перед сохранением
      const encrypted = { ...entry };
      encrypted.value = this.encrypt(entry.value);
      encrypted.encrypted = true;
      
      data[key] = encrypted;
    }
    
    await fs.writeFile(
      this.credentialsFile,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }

  /**
   * Установить credential
   */
  set(key: string, value: string): void {
    const now = Date.now();
    const existing = this.credentials.get(key);
    
    this.credentials.set(key, {
      key,
      value,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      encrypted: true
    });
  }

  /**
   * Получить credential
   */
  get(key: string): string | undefined {
    return this.credentials.get(key)?.value;
  }

  /**
   * Удалить credential
   */
  delete(key: string): boolean {
    return this.credentials.delete(key);
  }

  /**
   * Проверить наличие credential
   */
  has(key: string): boolean {
    return this.credentials.has(key);
  }

  /**
   * Получить все ключи
   */
  keys(): string[] {
    return Array.from(this.credentials.keys());
  }

  /**
   * Очистить все credentials
   */
  clear(): void {
    this.credentials.clear();
  }

  /**
   * Шифрование AES-256-GCM
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Формат: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Расшифровка AES-256-GCM
   */
  private decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }
    
    const [ivHex, authTagHex, encryptedData] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Вывести ключ из мастер-пароля
   */
  private deriveKey(password: string): Buffer {
    // PBKDF2 для получения 32-байтового ключа
    return crypto.pbkdf2Sync(password, 'openclaw-salt', 100000, 32, 'sha256');
  }
}
