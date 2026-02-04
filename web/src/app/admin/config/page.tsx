'use client';

import { ConfigForm } from '@/components/admin/ConfigForm';

export default function ConfigPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-foreground mb-4">
        Configuration
      </h2>
      <ConfigForm />
    </div>
  );
}
