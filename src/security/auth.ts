/**
 * Authentication & Authorization Manager
 * Базовая аутентификация и авторизация
 */

import * as crypto from 'crypto';

export type UserRole = 'admin' | 'user' | 'guest';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  permissions: string[];
  metadata?: Record<string, any>;
}

export interface AuthToken {
  token: string;
  userId: string;
  expiresAt: number;
}

export interface AuthConfig {
  tokenExpiration?: number; // Время жизни токена (мс)
  hashRounds?: number; // Количество раундов хеширования
}

const DEFAULT_CONFIG: Required<AuthConfig> = {
  tokenExpiration: 24 * 60 * 60 * 1000, // 24 часа
  hashRounds: 10,
};

/**
 * Auth Manager
 */
export class AuthManager {
  private config: Required<AuthConfig>;
  private users = new Map<string, User & { passwordHash: string }>();
  private tokens = new Map<string, AuthToken>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(config?: AuthConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Периодическая очистка истекших токенов
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTokens();
    }, 60 * 1000); // Каждую минуту
  }

  /**
   * Регистрация нового пользователя
   */
  async register(
    username: string,
    password: string,
    role: UserRole = 'user',
    permissions: string[] = []
  ): Promise<User> {
    // Проверка на существование
    for (const user of this.users.values()) {
      if (user.username === username) {
        throw new Error(`User "${username}" already exists`);
      }
    }

    const userId = this.generateId();
    const passwordHash = await this.hashPassword(password);

    const user: User = {
      id: userId,
      username,
      role,
      permissions,
    };

    this.users.set(userId, { ...user, passwordHash });
    return user;
  }

  /**
   * Аутентификация (вход)
   */
  async authenticate(username: string, password: string): Promise<{ user: User; token: string }> {
    // Находим пользователя
    let foundUser: (User & { passwordHash: string }) | undefined;
    
    for (const user of this.users.values()) {
      if (user.username === username) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      throw new Error('Invalid username or password');
    }

    // Проверяем пароль
    const isValid = await this.verifyPassword(password, foundUser.passwordHash);
    if (!isValid) {
      throw new Error('Invalid username or password');
    }

    // Генерируем токен
    const token = this.generateToken();
    const authToken: AuthToken = {
      token,
      userId: foundUser.id,
      expiresAt: Date.now() + this.config.tokenExpiration,
    };

    this.tokens.set(token, authToken);

    const { passwordHash, ...user } = foundUser;
    return { user, token };
  }

  /**
   * Проверка токена
   */
  verify(token: string): User | null {
    const authToken = this.tokens.get(token);
    if (!authToken) return null;

    // Проверяем срок действия
    if (Date.now() > authToken.expiresAt) {
      this.tokens.delete(token);
      return null;
    }

    const user = this.users.get(authToken.userId);
    if (!user) return null;

    const { passwordHash, ...cleanUser } = user;
    return cleanUser;
  }

  /**
   * Выход (удаление токена)
   */
  logout(token: string): void {
    this.tokens.delete(token);
  }

  /**
   * Проверка разрешения
   */
  hasPermission(user: User, permission: string): boolean {
    // Админ имеет все разрешения
    if (user.role === 'admin') return true;

    return user.permissions.includes(permission);
  }

  /**
   * Проверка роли
   */
  hasRole(user: User, role: UserRole): boolean {
    const roleHierarchy: Record<UserRole, number> = {
      guest: 0,
      user: 1,
      admin: 2,
    };

    return roleHierarchy[user.role] >= roleHierarchy[role];
  }

  /**
   * Хеширование пароля
   */
  private async hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString('hex');
      crypto.pbkdf2(password, salt, this.config.hashRounds * 1000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      });
    });
  }

  /**
   * Проверка пароля
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const [salt, key] = hash.split(':');
      crypto.pbkdf2(password, salt, this.config.hashRounds * 1000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        resolve(key === derivedKey.toString('hex'));
      });
    });
  }

  /**
   * Генерация токена
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Генерация ID
   */
  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Очистка истекших токенов
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now();
    for (const [token, authToken] of this.tokens.entries()) {
      if (now > authToken.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }

  /**
   * Получить пользователя по ID
   */
  getUserById(userId: string): User | null {
    const user = this.users.get(userId);
    if (!user) return null;

    const { passwordHash, ...cleanUser } = user;
    return cleanUser;
  }

  /**
   * Удалить пользователя
   */
  deleteUser(userId: string): boolean {
    return this.users.delete(userId);
  }

  /**
   * Список всех пользователей
   */
  listUsers(): User[] {
    return Array.from(this.users.values()).map(({ passwordHash, ...user }) => user);
  }

  /**
   * Закрытие менеджера
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.tokens.clear();
  }
}

/**
 * Middleware для проверки авторизации
 */
export function createAuthMiddleware(authManager: AuthManager) {
  return (token: string): User | null => {
    return authManager.verify(token);
  };
}

/**
 * Базовые разрешения
 */
export const Permissions = {
  // Сессии
  SESSION_CREATE: 'session.create',
  SESSION_READ: 'session.read',
  SESSION_DELETE: 'session.delete',

  // Инструменты
  TOOL_EXECUTE: 'tool.execute',
  TOOL_ADMIN: 'tool.admin',

  // Sandbox
  SANDBOX_EXECUTE: 'sandbox.execute',

  // Система
  SYSTEM_ADMIN: 'system.admin',
  SYSTEM_LOGS: 'system.logs',
};
