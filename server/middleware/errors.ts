import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'REQUEST_FAILED') {
    super(message);
  }
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Recurso nao encontrado.' }, requestId: req.requestId });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const isCastError = error && error.name === 'CastError';
  const status = error instanceof HttpError ? error.status : error instanceof ZodError ? 400 : isCastError ? 400 : 500;
  const code = error instanceof HttpError ? error.code : error instanceof ZodError ? 'VALIDATION_ERROR' : isCastError ? 'INVALID_IDENTIFIER' : 'INTERNAL_ERROR';
  const message = status === 500 ? 'Nao foi possivel concluir a operacao.' : isCastError ? 'Identificador invalido.' : error.message;

  if (status === 500) {
    console.error(JSON.stringify({ level: 'error', requestId: req.requestId, path: req.path, message: error?.message, stack: error?.stack }));
  }

  const fieldErrors = error instanceof ZodError ? error.flatten().fieldErrors : undefined;
  res.status(status).json({ success: false, error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) }, requestId: req.requestId });
};

export function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
