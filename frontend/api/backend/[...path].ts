import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Readable } from "node:stream";

export const config = {
  api: {
    bodyParser: false,
  },
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "transfer-encoding",
]);

function readRequestBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const backendUrl = process.env.BACKEND_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.API_AUTH_KEY;

  if (!backendUrl || !apiKey) {
    return res.status(500).json({
      detail: "Backend proxy is not configured",
    });
  }

  const pathParam = req.query.path ?? req.query["...path"];
  const rawPath = Array.isArray(pathParam)
    ? pathParam.join("/")
    : pathParam || "";
  // Depending on the Vercel project routing configuration, catch-all params
  // can include the parent `api` or `backend` segment. Strip those prefixes
  // so BACKEND_API_URL can consistently end with `/api`.
  const path = rawPath
    .replace(/^\/+/, "")
    .replace(/^api\/backend\//, "")
    .replace(/^backend\//, "")
    .replace(/^api\//, "");
  const incomingUrl = new URL(req.url || "/", "http://vercel-proxy.local");
  // Vercel includes the catch-all route parameter in req.url as `?path=...`.
  // It is an internal routing value and must not be forwarded upstream.
  const forwardedQuery = new URLSearchParams(incomingUrl.searchParams);
  for (const key of [...forwardedQuery.keys()]) {
    if (key === "path" || key.endsWith("path")) {
      forwardedQuery.delete(key);
    }
  }
  const queryString = forwardedQuery.toString();
  const targetUrl = `${backendUrl}/${path}${queryString ? `?${queryString}` : ""}`;
  const body = ["GET", "HEAD"].includes(req.method || "GET")
    ? undefined
    : await readRequestBody(req);

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || !value) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  headers.set("X-API-Key", apiKey);

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body as unknown as BodyInit | undefined,
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
        res.setHeader(name, value);
      }
    });

    if (!upstream.body) {
      return res.end();
    }

    // Preserve SSE streaming for /process-stream/* instead of buffering the
    // complete LangGraph response in the proxy.
    return Readable.fromWeb(upstream.body as never).pipe(res);
  } catch (error) {
    console.error("Backend proxy request failed:", error);
    return res.status(502).json({ detail: "Backend unavailable" });
  }
}
