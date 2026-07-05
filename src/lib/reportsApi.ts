export type ReportFilterDefinition = {
  id: string;
  label: string;
  type: "date" | "select" | "text" | "number";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
};

export type ReportSection = {
  id: string;
  label: string;
  description: string;
};

export type ScreenReport = {
  id: string;
  sectionId: string;
  label: string;
  description: string;
  screen: string;
  filters: ReportFilterDefinition[];
};

export type ReportDownloadParams = Record<string, string | undefined>;

function extractErrorMessage(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  if (payload instanceof Error) return payload.message;
  if (typeof payload !== "object") return String(payload);

  const record = payload as Record<string, unknown>;
  const candidates = [record.message, record.error, record.detail, record.details, record.reason];
  for (const candidate of candidates) {
    const message = extractErrorMessage(candidate);
    if (message) return message;
  }

  if (Array.isArray(record.conflicts) && record.conflicts.length > 0) {
    const firstConflict = record.conflicts[0];
    const conflictMessage = extractErrorMessage(firstConflict);
    if (conflictMessage) return conflictMessage;
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return "Unexpected server error";
  }
}

async function readResponseError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    return extractErrorMessage(payload) || response.statusText || `HTTP ${response.status}`;
  }

  const text = await response.text().catch(() => "");
  return extractErrorMessage(text) || response.statusText || `HTTP ${response.status}`;
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }
  return response.json() as Promise<T>;
}

function buildQuery(params?: ReportDownloadParams) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    const normalized = String(value || "").trim();
    if (normalized && normalized !== "all") search.set(key, normalized);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function savePdfBlob(blob: Blob, response: Response, fallbackFilename: string) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || fallbackFilename;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function fetchPdf(url: string, fallbackFilename: string) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/pdf") && !contentType.includes("application/octet-stream")) {
    throw new Error(`Expected a PDF file but the server returned: ${await readResponseError(response)}`);
  }

  savePdfBlob(await response.blob(), response, fallbackFilename);
}

async function downloadPdf(sectionId: string, params?: ReportDownloadParams) {
  await fetchPdf(`/api/reports/${encodeURIComponent(sectionId)}.pdf${buildQuery(params)}`, `powergym-${sectionId}-report.pdf`);
}

async function downloadScreenPdf(reportId: string, params?: ReportDownloadParams) {
  await fetchPdf(`/api/reports/screen/${encodeURIComponent(reportId)}.pdf${buildQuery(params)}`, `powergym-${reportId}.pdf`);
}

async function downloadScheduledSessionsPdf(kind: "classes" | "private-pt", params?: ReportDownloadParams) {
  const endpoint = kind === "classes" ? "/api/reports/scheduled-classes.pdf" : "/api/reports/scheduled-private-pt.pdf";
  await fetchPdf(`${endpoint}${buildQuery(params)}`, `powergym-scheduled-${kind}.pdf`);
}

async function downloadClassSessionPdf(classId: string) {
  const id = String(classId || "").trim();
  if (!id) throw new Error("Class session ID is required");
  await fetchPdf(`/api/reports/class-session.pdf?${new URLSearchParams({ classId: id }).toString()}`, `powergym-class-session-${id}.pdf`);
}

export const reportsApi = {
  listSections: () => requestJson<{ sections: ReportSection[] }>("/api/reports/sections"),
  listScreenReports: () => requestJson<{ reports: ScreenReport[] }>("/api/reports/screen-catalog"),
  downloadPdf,
  downloadScreenPdf,
  downloadScheduledSessionsPdf,
  downloadClassSessionPdf,
};
