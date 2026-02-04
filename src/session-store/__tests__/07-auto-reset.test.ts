/**
 * Tests for auto-reset functionality
 */

import { 
  AutoResetManager, 
  shouldAutoReset, 
  performAutoReset,
  createResetMarker
} from '../AutoReset';
import type { Message, AutoResetConfig } from '../types';

function createMessage(id: string, content: string, timestamp?: number): Message {
  return {
    id,
    timestamp: timestamp ?? Date.now(),
    type: 'user',
    role: 'user',
    content,
    parentId: null
  };
}

describe('shouldAutoReset', () => {
  describe('disabled', () => {
    it('should not reset when disabled', () => {
      const config: AutoResetConfig = { enabled: false };
      const messages = [createMessage('1', 'test')];
      
      expect(shouldAutoReset(messages, config)).toBe(false);
    });
  });

  describe('maxMessages', () => {
    it('should reset when max messages reached', () => {
      const config: AutoResetConfig = { 
        enabled: true, 
        maxMessages: 3 
      };
      const messages = [
        createMessage('1', 'msg1'),
        createMessage('2', 'msg2'),
        createMessage('3', 'msg3')
      ];
      
      expect(shouldAutoReset(messages, config)).toBe(true);
    });

    it('should not reset below max', () => {
      const config: AutoResetConfig = { 
        enabled: true, 
        maxMessages: 5 
      };
      const messages = [
        createMessage('1', 'msg1'),
        createMessage('2', 'msg2')
      ];
      
      expect(shouldAutoReset(messages, config)).toBe(false);
    });
  });

  describe('maxAgeMs', () => {
    it('should reset when max age exceeded', () => {
      const config: AutoResetConfig = { 
        enabled: true, 
        maxAgeMs: 1000 
      };
      const oldTime = Date.now() - 2000;
      const messages = [createMessage('1', 'old', oldTime)];
      
      expect(shouldAutoReset(messages, config)).toBe(true);
    });

    it('should not reset within max age', () => {
      const config: AutoResetConfig = { 
        enabled: true, 
        maxAgeMs: 10000 
      };
      const messages = [createMessage('1', 'recent')];
      
      expect(shouldAutoReset(messages, config)).toBe(false);
    });
  });

  describe('maxTokens', () => {
    it('should reset when max tokens exceeded', () => {
      const config: AutoResetConfig = {
        enabled: true,
        maxTokens: 100,
        tokenCounter: (msg: Message) => (typeof msg.content === 'string' ? msg.content.length : 0)
      };
      const messages = [
        createMessage('1', 'a'.repeat(60)),
        createMessage('2', 'b'.repeat(60))
      ];
      
      expect(shouldAutoReset(messages, config)).toBe(true);
    });

    it('should not reset below max tokens', () => {
      const config: AutoResetConfig = {
        enabled: true,
        maxTokens: 100,
        tokenCounter: (msg: Message) => (typeof msg.content === 'string' ? msg.content.length : 0)
      };
      const messages = [
        createMessage('1', 'short'),
        createMessage('2', 'text')
      ];
      
      expect(shouldAutoReset(messages, config)).toBe(false);
    });
  });
});

describe('performAutoReset', () => {
  const messages = [
    createMessage('1', 'First'),
    createMessage('2', 'Second'),
    createMessage('3', 'Third'),
    { ...createMessage('4', 'System'), type: 'system' as const }
  ];

  describe('strategy: none', () => {
    it('should keep no messages', () => {
      const config: AutoResetConfig = {
        enabled: true,
        keepStrategy: 'none'
      };
      
      const kept = performAutoReset(messages, config);
      expect(kept).toHaveLength(0);
    });
  });

  describe('strategy: first', () => {
    it('should keep first N messages', () => {
      const config: AutoResetConfig = {
        enabled: true,
        keepStrategy: 'first',
        keepCount: 2
      };
      
      const kept = performAutoReset(messages, config);
      expect(kept).toHaveLength(2);
      expect(kept[0].content).toBe('First');
      expect(kept[1].content).toBe('Second');
    });

    it('should keep first message by default', () => {
      const config: AutoResetConfig = {
        enabled: true,
        keepStrategy: 'first'
      };
      
      const kept = performAutoReset(messages, config);
      expect(kept).toHaveLength(1);
      expect(kept[0].content).toBe('First');
    });
  });

  describe('strategy: last', () => {
    it('should keep last N messages', () => {
      const config: AutoResetConfig = {
        enabled: true,
        keepStrategy: 'last',
        keepCount: 2
      };
      
      const kept = performAutoReset(messages, config);
      expect(kept).toHaveLength(2);
      expect(kept[0].content).toBe('Third');
      expect(kept[1].content).toBe('System');
    });

    it('should keep last message by default', () => {
      const config: AutoResetConfig = {
        enabled: true,
        keepStrategy: 'last'
      };
      
      const kept = performAutoReset(messages, config);
      expect(kept).toHaveLength(1);
      expect(kept[0].content).toBe('System');
    });
  });

  describe('strategy: system', () => {
    it('should keep only system messages', () => {
      const config: AutoResetConfig = {
        enabled: true,
        keepStrategy: 'system'
      };
      
      const kept = performAutoReset(messages, config);
      expect(kept).toHaveLength(1);
      expect(kept[0].content).toBe('System');
    });

    it('should limit system messages by keepCount', () => {
      const msgs = [
        { ...createMessage('1', 'Sys1'), type: 'system' as const },
        { ...createMessage('2', 'Sys2'), type: 'system' as const },
        { ...createMessage('3', 'Sys3'), type: 'system' as const }
      ];
      
      const config: AutoResetConfig = {
        enabled: true,
        keepStrategy: 'system',
        keepCount: 2
      };
      
      const kept = performAutoReset(msgs, config);
      expect(kept).toHaveLength(2);
    });
  });
});

describe('createResetMarker', () => {
  it('should create reset marker message', () => {
    const marker = createResetMarker('max messages (10)');
    
    expect(marker.type).toBe('system');
    expect(marker.role).toBe('system');
    expect(marker.content).toContain('AUTO-RESET');
    expect(marker.content).toContain('max messages (10)');
    expect(marker.parentId).toBeNull();
  });
});

describe('AutoResetManager', () => {
  describe('checkAndReset', () => {
    it('should not reset when conditions not met', () => {
      const manager = new AutoResetManager({
        enabled: true,
        maxMessages: 10
      });
      
      const messages = [
        createMessage('1', 'msg1'),
        createMessage('2', 'msg2')
      ];
      
      const result = manager.checkAndReset(messages);
      
      expect(result.reset).toBe(false);
      expect(result.messages).toEqual(messages);
    });

    it('should reset when conditions met', () => {
      const manager = new AutoResetManager({
        enabled: true,
        maxMessages: 2,
        keepStrategy: 'first',
        keepCount: 1
      });
      
      const messages = [
        createMessage('1', 'First'),
        createMessage('2', 'Second')
      ];
      
      const result = manager.checkAndReset(messages);
      
      expect(result.reset).toBe(true);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('First');
    });

    it('should insert reset marker when configured', () => {
      const manager = new AutoResetManager({
        enabled: true,
        maxMessages: 2,
        keepStrategy: 'none',
        insertResetMarker: true
      });
      
      const messages = [
        createMessage('1', 'msg1'),
        createMessage('2', 'msg2')
      ];
      
      const result = manager.checkAndReset(messages);
      
      expect(result.reset).toBe(true);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].type).toBe('system');
      expect(result.messages[0].content).toContain('AUTO-RESET');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const manager = new AutoResetManager({
        enabled: true,
        maxMessages: 10
      });
      
      manager.updateConfig({ maxMessages: 20 });
      
      const config = manager.getConfig();
      expect(config.maxMessages).toBe(20);
    });
  });

  describe('getConfig', () => {
    it('should return copy of config', () => {
      const manager = new AutoResetManager({
        enabled: true,
        maxMessages: 10
      });
      
      const config = manager.getConfig();
      config.maxMessages = 999;
      
      const config2 = manager.getConfig();
      expect(config2.maxMessages).toBe(10);
    });
  });
});
