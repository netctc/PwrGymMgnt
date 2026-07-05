import { z, type ZodTypeAny } from 'zod';

type ApiOptions = Omit<RequestInit, 'body'> & { body?: BodyInit | Record<string, unknown> | null };

function encodeBody(headers: Headers, body: ApiOptions['body']) {
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    return JSON.stringify(body);
  }
  return body as BodyInit | null | undefined;
}

function errorMessageFromIssues(error: z.ZodError) {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`)
    .join('; ');
}

export async function typedApiRequest<TSchema extends ZodTypeAny>(
  url: string,
  responseSchema: TSchema,
  options: ApiOptions = {},
): Promise<z.infer<TSchema>> {
  const headers = new Headers(options.headers);
  const body = encodeBody(headers, options.body);
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid API response from ${url}: ${errorMessageFromIssues(parsed.error)}`);
  }
  return parsed.data;
}
