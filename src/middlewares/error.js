import { ZodError } from 'zod';

/**
 * Express error handler that normalises structured errors.
 * @param {Error & {status?: number, code?: string, details?: unknown}} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, _req, res, _next) {
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
