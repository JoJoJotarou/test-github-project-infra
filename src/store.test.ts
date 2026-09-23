import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileTodoStore } from './store.ts';
import { TITLE_MAX_LENGTH } from './todo.ts';

let directory: string;
let dataFile: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'todo-store-'));
  dataFile = join(directory, 'nested', 'todos.json');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function store(): FileTodoStore {
  return new FileTodoStore(dataFile);
}

describe('FileTodoStore', () => {
  it('starts empty when the data file does not exist', async () => {
    await expect(store().list()).resolves.toEqual([]);
  });

  it('creates a todo with a trimmed title and a generated id', async () => {
    const created = await store().create('  buy milk  ');
    expect(created.title).toBe('buy milk');
    expect(created.completed).toBe(false);
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await store().list()).toHaveLength(1);
  });

  it('rejects titles that are missing, non-string, empty, or too long', async () => {
    await expect(store().create(undefined)).rejects.toThrow('title is required');
    await expect(store().create(42)).rejects.toThrow('title must be a string');
    await expect(store().create('   ')).rejects.toThrow('title must not be empty');
    await expect(store().create('x'.repeat(TITLE_MAX_LENGTH + 1))).rejects.toThrow(
      `at most ${TITLE_MAX_LENGTH} characters`,
    );
    await expect(store().list()).resolves.toEqual([]);
  });

  it('rejects a patch with nothing to update or a non-boolean completed', async () => {
    await expect(store().update('missing', {})).rejects.toThrow('nothing to update');
    await expect(store().update('missing', { completed: 'yes' })).rejects.toThrow(
      'completed must be a boolean',
    );
  });

  it('returns undefined when updating an unknown id', async () => {
    await expect(store().update('nope', { completed: true })).resolves.toBeUndefined();
  });

  it('persists across store instances', async () => {
    const created = await store().create('write the report');
    await store().update(created.id, { completed: true });
    const reloaded = await new FileTodoStore(dataFile).list();
    expect(reloaded.at(-1)).toMatchObject({
      id: created.id,
      title: 'write the report',
      completed: true,
    });
  });

  it('removes a todo and reports whether it existed', async () => {
    const created = await store().create('temporary');
    await expect(store().remove(created.id)).resolves.toBe(true);
    await expect(store().remove(created.id)).resolves.toBe(false);
  });

  it('serializes concurrent creates', async () => {
    const concurrent = store();
    const titles = ['a', 'b', 'c', 'd', 'e'];
    const created = await Promise.all(titles.map((title) => concurrent.create(title)));
    expect(created.map((todo) => todo.title).sort()).toEqual(titles);
    expect(await concurrent.list()).toHaveLength(titles.length);
  });

  it('fails loudly on unparseable JSON instead of resetting the data file', async () => {
    await mkdir(dirname(dataFile), { recursive: true });
    await writeFile(dataFile, '{ not json', 'utf8');
    await expect(store().list()).rejects.toThrow(SyntaxError);
    expect(await readFile(dataFile, 'utf8')).toBe('{ not json');
  });

  it('fails loudly when the JSON shape is wrong', async () => {
    await mkdir(dirname(dataFile), { recursive: true });
    await writeFile(dataFile, '{"items": []}', 'utf8');
    await expect(store().list()).rejects.toThrow(`corrupt data file: ${dataFile}`);
  });

  it('writes the data file as pretty JSON with a trailing newline', async () => {
    await store().create('shape check');
    const raw = await readFile(dataFile, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(JSON.parse(raw)).toHaveProperty('todos.0.title', 'shape check');
  });
});

it("deliberately fails", () => {
  expect(1).toBe(2);
});
