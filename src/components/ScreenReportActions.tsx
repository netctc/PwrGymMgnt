import { useEffect, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { reportsApi, type ReportDownloadParams, type ScreenReport } from '../lib/reportsApi';
import { cn } from '../lib/utils';

type ScreenReportActionsProps = {
  reportIds: string[];
  params?: ReportDownloadParams;
  title?: string;
  description?: string;
  className?: string;
  compact?: boolean;
  showDateFilters?: boolean;
  defaultFrom?: string;
  defaultTo?: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function daysAgo(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value.toISOString().slice(0, 10);
}

function cleanParams(params: ReportDownloadParams): ReportDownloadParams {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      const normalized = String(value || '').trim();
      return normalized && normalized !== 'all';
    }),
  );
}

let screenCatalogPromise: Promise<{ reports: ScreenReport[] }> | null = null;

function loadScreenCatalog() {
  if (!screenCatalogPromise) screenCatalogPromise = reportsApi.listScreenReports();
  return screenCatalogPromise;
}

export default function ScreenReportActions({
  reportIds,
  params,
  title = 'PDF reports',
  description = 'Generate role-aware PDFs for this screen using the active filters below.',
  className,
  compact = false,
  showDateFilters = true,
  defaultFrom = daysAgo(30),
  defaultTo = today(),
}: ScreenReportActionsProps) {
  const [catalog, setCatalog] = useState<ScreenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const controlIdPrefix = useMemo(() => title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), [title]);

  useEffect(() => {
    setFrom(defaultFrom);
    setTo(defaultTo);
  }, [defaultFrom, defaultTo]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadScreenCatalog()
      .then((response) => {
        if (active) setCatalog(response.reports || []);
      })
      .catch((error: any) => {
        screenCatalogPromise = null;
        if (active) toast.error(error.message || 'Could not load screen report catalog');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const reports = useMemo(() => {
    const allowed = new Set(reportIds);
    return catalog.filter((report) => allowed.has(report.id));
  }, [catalog, reportIds]);

  const mergedParams = useMemo(() => {
    return cleanParams({
      ...(params || {}),
      ...(showDateFilters ? { from, to } : {}),
    });
  }, [from, params, showDateFilters, to]);

  const downloadReport = async (report: ScreenReport) => {
    setDownloading(report.id);
    try {
      await reportsApi.downloadScreenPdf(report.id, mergedParams);
      toast.success(`${report.label} PDF generated`);
    } catch (error: any) {
      toast.error(error.message || `Could not generate ${report.label}`);
    } finally {
      setDownloading(null);
    }
  };

  if (!loading && reports.length === 0) return null;

  const body = (
    <>
      {showDateFilters && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(140px,180px)_minmax(140px,180px)_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={`${controlIdPrefix}-from`}>From</Label>
            <Input id={`${controlIdPrefix}-from`} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${controlIdPrefix}-to`}>To</Label>
            <Input id={`${controlIdPrefix}-to`} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="flex items-end text-xs text-slate-500">
            Screen filters such as status, search text, trainer, member, role or category are copied from the current page where available.
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {loading ? (
          <Button type="button" variant="outline" disabled>
            Loading reports...
          </Button>
        ) : (
          reports.map((report) => (
            <Button
              key={report.id}
              type="button"
              variant="outline"
              onClick={() => downloadReport(report)}
              disabled={downloading !== null}
              title={report.description}
            >
              <Download className="mr-2 h-4 w-4" />
              {downloading === report.id ? 'Generating...' : report.label}
            </Button>
          ))
        )}
      </div>
    </>
  );

  if (compact) {
    return <div className={cn('space-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm', className)}>{body}</div>;
  }

  return (
    <Card className={cn('border-slate-100 shadow-sm', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-indigo-600" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{body}</CardContent>
    </Card>
  );
}
