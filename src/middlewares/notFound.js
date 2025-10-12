/**
 * Catch-all 404 handler for unmatched routes.
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
export function notFound(_req, res) {
  res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Route not found' });
}
