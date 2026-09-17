import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { maskSensitiveError } from "@/domain/privacy";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function rateLimitConfig() {
  return {
    windowMs: Number(process.env.FAIRTURN_RATE_LIMIT_WINDOW_MS ?? 60_000),
    max: Number(process.env.FAIRTURN_RATE_LIMIT_MAX ?? 60)
  };
}

export function clientKeyForRateLimit(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = realIp ?? forwardedFor?.split(",")[0]?.trim() ?? "local-demo-client";
  return `ip:${ip}`;
}

export function checkRateLimit(request: Request, scope: string) {
  const { windowMs, max } = rateLimitConfig();
  const now = Date.now();
  const key = `${scope}:${clientKeyForRateLimit(request)}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= max) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

export function rateLimited(scope: string, request: Request) {
  const result = checkRateLimit(request, scope);
  if (result.ok) return null;
  return NextResponse.json(
    {
      ok: false,
      status: "rate_limited",
      message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요."
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function parseJsonBody(request: Request, maxBytes = 200_000) {
  const raw = await request.text();
  if (raw.length > maxBytes) {
    throw new PayloadTooLargeError();
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidJsonError();
  }
}

export class InvalidJsonError extends Error {}
export class PayloadTooLargeError extends Error {}

export function apiError(error: unknown) {
  if (error instanceof InvalidJsonError) {
    return NextResponse.json({ ok: false, status: "bad_json", message: "JSON 본문을 파싱할 수 없습니다." }, { status: 400 });
  }
  if (error instanceof PayloadTooLargeError) {
    return NextResponse.json({ ok: false, status: "payload_too_large", message: "요청 본문이 너무 큽니다." }, { status: 400 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, status: "schema_error", validationWarnings: error.issues.map((issue) => issue.message) },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: false, status: "error", message: maskSensitiveError(error) }, { status: 500 });
}
