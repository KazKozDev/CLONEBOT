'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function ConfigForm() {
  const [config, setConfig] = useState({
    apiKey: '',
    maxTokens: 4000,
    temperature: 0.7,
    systemPrompt: '',
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        }
      );
      if (!response.ok) throw new Error('Failed to save config');
      alert('Configuration saved successfully');
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          API Key
        </label>
        <Input
          type="password"
          value={config.apiKey}
          onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
          placeholder="Enter API key"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Max Tokens
        </label>
        <Input
          type="number"
          value={config.maxTokens}
          onChange={(e) =>
            setConfig({ ...config, maxTokens: parseInt(e.target.value) })
          }
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Temperature
        </label>
        <Input
          type="number"
          step="0.1"
          value={config.temperature}
          onChange={(e) =>
            setConfig({ ...config, temperature: parseFloat(e.target.value) })
          }
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          System Prompt
        </label>
        <textarea
          value={config.systemPrompt}
          onChange={(e) =>
            setConfig({ ...config, systemPrompt: e.target.value })
          }
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground min-h-32"
          placeholder="Enter system prompt"
        />
      </div>

      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save Configuration'}
      </Button>
    </div>
  );
}
