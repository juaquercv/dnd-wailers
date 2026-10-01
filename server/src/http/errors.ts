/** HTTP error with a Spanish, user-facing message. Serialized by the app error handler as ApiError. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function badRequest(message = 'Solicitud inválida', details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function unauthorized(message = 'Debes elegir un usuario para continuar', details?: unknown): HttpError {
  return new HttpError(401, message, details);
}

export function forbidden(message = 'No tienes permiso para hacer esto', details?: unknown): HttpError {
  return new HttpError(403, message, details);
}

export function notFound(message = 'No encontrado', details?: unknown): HttpError {
  return new HttpError(404, message, details);
}

export function conflict(message = 'Conflicto con el estado actual', details?: unknown): HttpError {
  return new HttpError(409, message, details);
}
