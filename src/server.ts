import { readFile } from 'node:fs/promises';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TodoStore } from './store.ts';
import { PayloadTooLargeError, ValidationError } from './todo.ts';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const BODY_LIMIT_BYTES = 64 * 1024;

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export interface StartedServer {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}

export function createTodoServer(store: TodoStore): Server {
  return createServer((request, response) => {
    void handle(store, request, response).catch((error: unknown) => {
      respondToError(error, response);
    });
  });
}

export async function listen(
  server: Server,
  options: { host?: string; port?: number } = {},
): Promise<StartedServer> {
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  await new Promise<void>((ready, failed) => {
    server.once('error', failed);
    server.listen(port, host, () => {
      server.off('error', failed);
      ready();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('server is not listening on a TCP port');
  }
  const url = `http://${host}:${address.port}`;
  return {
    url,
    port: address.port,
    close: () =>
      new Promise<void>((closed, failed) => {
        server.close((error) => {
          if (error === undefined) {
            closed();
          } else {
            failed(error);
          }
        });
      }),
  };
}

async function handle(
  store: TodoStore,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const method = request.method ?? 'GET';

  if (path === '/api/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (path === '/api/todos' && method === 'GET') {
    sendJson(response, 200, await store.list());
    return;
  }

  if (path === '/api/todos' && method === 'POST') {
    const body = await readJsonBody(request);
    const title = isRecord(body) ? body.title : undefined;
    const todo = await store.create(title);
    sendJson(response, 201, todo);
    return;
  }

  const todoMatch = /^\/api\/todos\/([^/]+)$/.exec(path);
  if (todoMatch !== null) {
    const id = decodeURIComponent(todoMatch[1] as string);
    if (method === 'PATCH' || method === 'PUT') {
      const todo = await store.update(id, await readJsonBody(request));
      if (todo === undefined) {
        sendJson(response, 404, { error: 'todo not found' });
        return;
      }
      sendJson(response, 200, todo);
      return;
    }
    if (method === 'DELETE') {
      const removed = await store.remove(id);
      if (!removed) {
        sendJson(response, 404, { error: 'todo not found' });
        return;
      }
      response.writeHead(204).end();
      return;
    }
  }

  if (method === 'GET') {
    await serveStatic(path, response);
    return;
  }

  sendJson(response, 404, { error: 'not found' });
}

async function serveStatic(path: string, response: ServerResponse): Promise<void> {
  const relative = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  const filePath = resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 404, { error: 'not found' });
    return;
  }
  let body: Buffer;
  try {
    body = await readFile(filePath);
  } catch {
    sendJson(response, 404, { error: 'not found' });
    return;
  }
  response.writeHead(200, {
    'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
    'content-length': body.byteLength,
    'cache-control': 'no-store',
  });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT_BYTES) {
      throw new PayloadTooLargeError();
    }
    chunks.push(chunk as Buffer);
  }
  if (size === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function respondToError(error: unknown, response: ServerResponse): void {
  if (error instanceof ValidationError) {
    sendJson(response, 400, { error: error.message });
    return;
  }
  if (error instanceof PayloadTooLargeError) {
    sendJson(response, 413, { error: error.message });
    return;
  }
  if (error instanceof SyntaxError) {
    sendJson(response, 400, { error: 'invalid JSON body' });
    return;
  }
  console.error('unhandled request failure', error);
  sendJson(response, 500, { error: 'internal server error' });
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}
