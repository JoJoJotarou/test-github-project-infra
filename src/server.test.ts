import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTodoServer, listen } from './server.ts';
import { FileTodoStore } from './store.ts';

let directory: string;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'todo-http-'));
  server = createTodoServer(new FileTodoStore(join(directory, 'todos.json')));
  const started = await listen(server, { host: '127.0.0.1', port: 0 });
  baseUrl = started.url;
});

afterAll(async () => {
  await server.close();
  await rm(directory, { recursive: true, force: true });
});

function rawGet(path: string): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolveGet, rejectGet) => {
    const { port } = new URL(baseUrl);
    const raw = request(
      { host: '127.0.0.1', port: Number(port), path, method: 'GET' },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => resolveGet({ status: response.statusCode, body }));
      },
    );
    raw.on('error', rejectGet);
    raw.end();
  });
}

describe('todo http api', () => {
  it('reports health', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('creates, reads, updates, and deletes a todo', async () => {
    const created = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'ship the thing' }),
    });
    expect(created.status).toBe(201);
    const todo = (await created.json()) as { id: string; title: string; completed: boolean };
    expect(todo.title).toBe('ship the thing');
    expect(todo.completed).toBe(false);

    const listed = await fetch(`${baseUrl}/api/todos`);
    expect(listed.status).toBe(200);
    const todos = (await listed.json()) as { id: string }[];
    expect(todos.map((entry) => entry.id)).toContain(todo.id);

    const patched = await fetch(`${baseUrl}/api/todos/${todo.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    expect(patched.status).toBe(200);
    await expect(patched.json()).resolves.toMatchObject({ id: todo.id, completed: true });

    const removed = await fetch(`${baseUrl}/api/todos/${todo.id}`, { method: 'DELETE' });
    expect(removed.status).toBe(204);
    const secondDelete = await fetch(`${baseUrl}/api/todos/${todo.id}`, { method: 'DELETE' });
    expect(secondDelete.status).toBe(404);
  });

  it('answers 404 for an unknown todo', async () => {
    const response = await fetch(`${baseUrl}/api/todos/does-not-exist`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'todo not found' });
  });

  it('answers 400 for a missing title and for malformed JSON', async () => {
    const missingTitle = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '  ' }),
    });
    expect(missingTitle.status).toBe(400);
    await expect(missingTitle.json()).resolves.toEqual({ error: 'title must not be empty' });

    const noTitle = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });
    expect(noTitle.status).toBe(400);
    await expect(noTitle.json()).resolves.toEqual({ error: 'title is required' });

    const malformed = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ oops',
    });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: 'invalid JSON body' });
  });

  it('answers 413 for an oversized body', async () => {
    const response = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x'.repeat(70 * 1024) }),
    });
    expect(response.status).toBe(413);
  });

  it('answers 404 for an unknown route and an unknown method', async () => {
    const unknownRoute = await fetch(`${baseUrl}/nope`);
    expect(unknownRoute.status).toBe(404);
    const notAllowed = await fetch(`${baseUrl}/api/todos`, { method: 'PUT' });
    expect(notAllowed.status).toBe(404);
  });

  it('serves the frontend and blocks path traversal', async () => {
    const index = await fetch(`${baseUrl}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    await expect(index.text()).resolves.toContain('Todo');

    const script = await fetch(`${baseUrl}/app.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toContain('text/javascript');

    await expect(rawGet('/../package.json')).resolves.toMatchObject({ status: 404 });
    await expect(rawGet('/%2e%2e/package.json')).resolves.toMatchObject({ status: 404 });
    await expect(rawGet('/../../etc/passwd')).resolves.toMatchObject({ status: 404 });
  });
});
