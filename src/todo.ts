export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export const TITLE_MAX_LENGTH = 200;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class PayloadTooLargeError extends Error {
  constructor() {
    super('request body too large');
    this.name = 'PayloadTooLargeError';
  }
}

export interface TodoPatch {
  title?: string;
  completed?: boolean;
}

export function normalizeTitle(raw: unknown): string {
  if (raw === undefined || raw === null) {
    throw new ValidationError('title is required');
  }
  if (typeof raw !== 'string') {
    throw new ValidationError('title must be a string');
  }
  const title = raw.trim();
  if (title.length === 0) {
    throw new ValidationError('title must not be empty');
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw new ValidationError(`title must be at most ${TITLE_MAX_LENGTH} characters`);
  }
  return title;
}

export function normalizePatch(raw: unknown): TodoPatch {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ValidationError('request body must be an object');
  }
  const body = raw as Record<string, unknown>;
  const patch: TodoPatch = {};
  if ('title' in body) {
    patch.title = normalizeTitle(body.title);
  }
  if ('completed' in body) {
    if (typeof body.completed !== 'boolean') {
      throw new ValidationError('completed must be a boolean');
    }
    patch.completed = body.completed;
  }
  if (patch.title === undefined && patch.completed === undefined) {
    throw new ValidationError('nothing to update: send title and/or completed');
  }
  return patch;
}
