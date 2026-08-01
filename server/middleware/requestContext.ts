import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  req.requestId = req.get('x-request-id')?.slice(0, 100) || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}
