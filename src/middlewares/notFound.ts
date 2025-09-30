import { Request, Response } from 'express';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Route not found' });
}
