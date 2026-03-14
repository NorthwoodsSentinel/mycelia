import type { ApiResponse, ApiError, ErrorCode } from '../types';

export function generateId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function success<T>(data: T): ApiResponse<T> {
  return {
    ok: true,
    data,
    meta: { request_id: generateId(), timestamp: now() }
  };
}

export function error(code: ErrorCode, message: string, status: number) {
  return {
    body: {
      ok: false,
      error: { code, message },
      meta: { request_id: generateId(), timestamp: now() }
    } as ApiError,
    status
  };
}
