import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

type ErrorWithExtras = Error & {
  status?: number;
  code?: string;
  details?: unknown;
};

export function errorHandler(
  err: ErrorWithExtras,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: err.flatten(),
    });
    return;
  }

  const status = err.status ?? 500;
  const code = err.code ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');

  res.status(status).json({
    status,
    code,
    message: err.message ?? 'Something went wrong',
    details: err.details ?? undefined,
  });
}
