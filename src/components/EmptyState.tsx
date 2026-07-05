import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { Button } from './ui/button';

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
};

export default function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 text-center ${compact ? 'p-4' : 'p-8'}`}>
      <div className="mb-3 rounded-full bg-background p-3 text-muted-foreground shadow-sm">
        {icon || <Inbox className="h-5 w-5" />}
      </div>
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {actionLabel && onAction && (
        <Button type="button" variant="outline" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
