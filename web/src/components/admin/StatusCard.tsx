interface StatusCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
}

export function StatusCard({ title, value, subtitle }: StatusCardProps) {
  return (
    <div className="p-6 rounded-lg border border-border bg-card">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        {title}
      </h3>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}
