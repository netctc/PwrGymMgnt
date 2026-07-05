import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card, CardContent } from './ui/card';

type InlineAlertVariant = 'error' | 'warning' | 'info' | 'success';

type InlineAlertProps = {
  title: string;
  children?: ReactNode;
  variant?: InlineAlertVariant;
};

const variantClasses: Record<InlineAlertVariant, string> = {
  error: 'border-red-200 bg-red-50 text-red-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

const icons: Record<InlineAlertVariant, ReactNode> = {
  error: <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />,
  warning: <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />,
  info: <Info className="mt-0.5 h-5 w-5 shrink-0" />,
  success: <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />,
};

export default function InlineAlert({ title, children, variant = 'warning' }: InlineAlertProps) {
  return (
    <Card className={variantClasses[variant]}>
      <CardContent className="flex items-start gap-3 py-4">
        {icons[variant]}
        <div>
          <p className="font-semibold">{title}</p>
          {children && <div className="mt-1 text-sm">{children}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
