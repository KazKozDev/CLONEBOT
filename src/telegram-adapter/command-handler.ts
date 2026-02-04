/**
 * Command Handler
 * 
 * Handles bot commands
 */

import { ParsedMessage, CommandContext, CommandHandler } from './types';
import { EventEmitter } from 'events';

export class TelegramCommandHandler extends EventEmitter {
  private commands: Map<string, CommandHandler>;
  private readonly commandPrefix: string;

  constructor(commandPrefix: string = '/') {
    super();
    this.commands = new Map();
    this.commandPrefix = commandPrefix;
  }

  /**
   * Register a command handler
   */
  registerCommand(command: string, handler: CommandHandler): void {
    this.commands.set(command.toLowerCase(), handler);
  }

  /**
   * Unregister a command handler
   */
  unregisterCommand(command: string): void {
    this.commands.delete(command.toLowerCase());
  }

  /**
   * Handle incoming message (if it's a command)
   */
  async handleCommand(message: ParsedMessage): Promise<boolean> {
    if (!this.isCommand(message)) {
      return false;
    }
    
    const command = message.command!.toLowerCase();
    const handler = this.commands.get(command);
    
    if (!handler) {
      // Unknown command
      this.emit('unknown_command', message);
      return false;
    }
    
    const context: CommandContext = {
      message,
      command,
      args: message.commandArgs ?? [],
    };
    
    try {
      await handler(context);
      return true;
    } catch (error) {
      this.emit('command_error', { command, error, context });
      throw error;
    }
  }

  /**
   * Check if message is a command
   */
  isCommand(message: ParsedMessage): boolean {
    return message.type === 'command' && message.command !== undefined;
  }

  /**
   * Parse command from text
   */
  parseCommand(text: string): { command: string; args: string[] } | null {
    if (!text.startsWith(this.commandPrefix)) {
      return null;
    }
    
    const match = text.match(/^\/([a-zA-Z0-9_]+)(@[a-zA-Z0-9_]+)?\s*(.*)?$/);
    
    if (!match) {
      return null;
    }
    
    const command = match[1];
    const argsText = match[3] ?? '';
    const args = argsText ? argsText.split(/\s+/) : [];
    
    return { command, args };
  }

  /**
   * Get registered commands
   */
  getCommands(): string[] {
    return Array.from(this.commands.keys());
  }

  /**
   * Check if command is registered
   */
  hasCommand(command: string): boolean {
    return this.commands.has(command.toLowerCase());
  }
}
