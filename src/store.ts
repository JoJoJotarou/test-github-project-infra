import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Todo, TodoPatch } from './todo.ts';
import { normalizePatch, normalizeTitle } from './todo.ts';

interface PersistedState {
  todos: Todo[];
}

const EMPTY_STATE: PersistedState = { todos: [] };

export interface TodoStore {
  list(): Promise<Todo[]>;
  create(rawTitle: unknown): Promise<Todo>;
  update(id: string, rawPatch: unknown): Promise<Todo | undefined>;
  remove(id: string): Promise<boolean>;
}

/**
 * JSON-file store. Writes are serialized through a promise chain and land via a
 * temp file plus rename, so a crash mid-write cannot truncate the data file.
 */
export class FileTodoStore implements TodoStore {
  readonly #file: string;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(file: string) {
    this.#file = file;
  }

  async list(): Promise<Todo[]> {
    return (await this.#read()).todos;
  }

  async create(rawTitle: unknown): Promise<Todo> {
    const title = normalizeTitle(rawTitle);
    return this.#enqueue(async () => {
      const state = await this.#read();
      const now = new Date().toISOString();
      const todo: Todo = {
        id: randomUUID(),
        title,
        completed: false,
        createdAt: now,
        updatedAt: now,
      };
      state.todos.push(todo);
      await this.#write(state);
      return todo;
    });
  }

  async update(id: string, rawPatch: unknown): Promise<Todo | undefined> {
    const patch: TodoPatch = normalizePatch(rawPatch);
    return this.#enqueue(async () => {
      const state = await this.#read();
      const todo = state.todos.find((candidate) => candidate.id === id);
      if (todo === undefined) {
        return undefined;
      }
      if (patch.title !== undefined) {
        todo.title = patch.title;
      }
      if (patch.completed !== undefined) {
        todo.completed = patch.completed;
      }
      todo.updatedAt = new Date().toISOString();
      await this.#write(state);
      return todo;
    });
  }

  async remove(id: string): Promise<boolean> {
    return this.#enqueue(async () => {
      const state = await this.#read();
      const remaining = state.todos.filter((candidate) => candidate.id !== id);
      if (remaining.length === state.todos.length) {
        return false;
      }
      await this.#write({ todos: remaining });
      return true;
    });
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.catch(() => undefined);
    return result;
  }

  async #read(): Promise<PersistedState> {
    let text: string;
    try {
      text = await readFile(this.#file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return structuredClone(EMPTY_STATE);
      }
      throw error;
    }
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as PersistedState).todos)
    ) {
      throw new Error(`corrupt data file: ${this.#file}`);
    }
    return parsed as PersistedState;
  }

  async #write(state: PersistedState): Promise<void> {
    await mkdir(dirname(this.#file), { recursive: true });
    const temp = `${this.#file}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(temp, this.#file);
  }
}
