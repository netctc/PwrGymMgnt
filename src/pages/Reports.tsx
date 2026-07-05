import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Filter, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { reportsApi, type ReportFilterDefinition, type ReportSection, type ScreenReport } from "../lib/reportsApi";

const today = new Date().toISOString().slice(0, 10);
const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

const preferredOrder = [
  "all",
  "members",
  "staff",
  "payroll",
  "accounting",
  "classes",
  "private-pt",
  "plans-subscriptions",
  "support",
  "security",
];

function orderIndex(id: string) {
  const index = preferredOrder.indexOf(id);
  return index === -1 ? preferredOrder.length + 1 : index;
}

function defaultScreenFilters(report: ScreenReport) {
  const values: Record<string, string> = {};
  for (const filter of report.filters || []) {
    if (filter.id === "from") values.from = currentMonthStart;
    else if (filter.id === "to") values.to = today;
    else values[filter.id] = "";
  }
  return values;
}

function normalizeFilters(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      const normalized = String(value || "").trim();
      return normalized && normalized !== "all";
    }),
  );
}

function FilterInput({
  reportId,
  filter,
  value,
  onChange,
}: {
  key?: string;
  reportId: string;
  filter: ReportFilterDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = `${reportId}-${filter.id}`;
  if (filter.type === "select") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={inputId}>{filter.label}</Label>
        <select
          id={inputId}
          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">All</option>
          {(filter.options || []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{filter.label}</Label>
      <Input
        id={inputId}
        type={filter.type === "number" ? "number" : filter.type}
        value={value || ""}
        placeholder={filter.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export default function Reports() {
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [screenReports, setScreenReports] = useState<ScreenReport[]>([]);
  const [screenFilters, setScreenFilters] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(currentMonthStart);
  const [toDate, setToDate] = useState(today);

  const orderedSections = useMemo(() => {
    return [...sections].sort((a, b) => orderIndex(a.id) - orderIndex(b.id));
  }, [sections]);

  const orderedScreenReports = useMemo(() => {
    return [...screenReports].sort((a, b) => {
      const sectionCompare = orderIndex(a.sectionId) - orderIndex(b.sectionId);
      return sectionCompare || a.label.localeCompare(b.label);
    });
  }, [screenReports]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const [sectionData, screenData] = await Promise.all([
        reportsApi.listSections(),
        reportsApi.listScreenReports(),
      ]);
      setSections(sectionData.sections);
      setScreenReports(screenData.reports);
      setScreenFilters((current) => {
        const next = { ...current };
        for (const report of screenData.reports) {
          next[report.id] = { ...defaultScreenFilters(report), ...(next[report.id] || {}) };
        }
        return next;
      });
    } catch (error: any) {
      toast.error(error.message || "Could not load report catalog");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const updateScreenFilter = (reportId: string, filterId: string, value: string) => {
    setScreenFilters((current) => ({
      ...current,
      [reportId]: {
        ...(current[reportId] || {}),
        [filterId]: value,
      },
    }));
  };

  const resetScreenFilters = (report: ScreenReport) => {
    setScreenFilters((current) => ({ ...current, [report.id]: defaultScreenFilters(report) }));
  };

  const downloadSection = async (sectionId: string) => {
    setDownloading(`section:${sectionId}`);
    try {
      await reportsApi.downloadPdf(sectionId, { from: fromDate, to: toDate });
      toast.success("PDF report generated");
    } catch (error: any) {
      toast.error(error.message || "Could not generate report");
    } finally {
      setDownloading(null);
    }
  };

  const downloadScreenReport = async (report: ScreenReport) => {
    setDownloading(`screen:${report.id}`);
    try {
      await reportsApi.downloadScreenPdf(report.id, normalizeFilters(screenFilters[report.id] || defaultScreenFilters(report)));
      toast.success("Filtered screen PDF generated");
    } catch (error: any) {
      toast.error(error.message || "Could not generate screen report");
    } finally {
      setDownloading(null);
    }
  };

  const downloadAll = async () => {
    await downloadSection("all");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">PDF Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generate backend PDFs with role-aware filters for each operational screen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadReports} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={downloadAll} disabled={downloading !== null || !sections.some((section) => section.id === "all")}>
            <Download className="mr-2 h-4 w-4" /> Download Full Report
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consolidated report filters</CardTitle>
          <CardDescription>
            These filters apply to the all-sections PDF and legacy section PDFs that use period totals.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="report-from">From</Label>
            <Input id="report-from" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-to">To</Label>
            <Input id="report-to" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Section PDFs</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="py-12 text-center text-sm text-slate-500">Loading report sections...</CardContent>
            </Card>
          ) : orderedSections.length === 0 ? (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="py-12 text-center text-sm text-slate-500">No reports are available for your current role.</CardContent>
            </Card>
          ) : orderedSections.map((section) => (
            <Card key={section.id} className="border-slate-100 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-indigo-600" /> {section.label}
                </CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  variant={section.id === "all" ? "default" : "outline"}
                  onClick={() => downloadSection(section.id)}
                  disabled={downloading !== null}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {downloading === `section:${section.id}` ? "Generating..." : "Download PDF"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Screen-specific filtered PDFs</h2>
        </div>
        <p className="text-sm text-slate-500">
          These reports are intended to be reused inside application screens. Each PDF is limited by date range, status and screen-specific identifiers where applicable.
        </p>
        <div className="grid gap-4 xl:grid-cols-2">
          {loading ? (
            <Card className="xl:col-span-2">
              <CardContent className="py-12 text-center text-sm text-slate-500">Loading screen report catalog...</CardContent>
            </Card>
          ) : orderedScreenReports.length === 0 ? (
            <Card className="xl:col-span-2">
              <CardContent className="py-12 text-center text-sm text-slate-500">No screen reports are available for your current role.</CardContent>
            </Card>
          ) : orderedScreenReports.map((report) => {
            const values = screenFilters[report.id] || defaultScreenFilters(report);
            return (
              <Card key={report.id} className="border-slate-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">{report.label}</CardTitle>
                  <CardDescription>
                    <span className="font-medium text-slate-700">Screen:</span> {report.screen}. {report.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {(report.filters || []).map((filter) => (
                      <FilterInput
                        key={filter.id}
                        reportId={report.id}
                        filter={filter}
                        value={values[filter.id] || ""}
                        onChange={(value) => updateScreenFilter(report.id, filter.id, value)}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => downloadScreenReport(report)} disabled={downloading !== null}>
                      <Download className="mr-2 h-4 w-4" />
                      {downloading === `screen:${report.id}` ? "Generating..." : "Download filtered PDF"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => resetScreenFilters(report)} disabled={downloading !== null}>
                      Reset filters
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
