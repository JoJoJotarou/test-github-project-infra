import { createTodoServer, listen } from './server.ts';
import { FileTodoStore } from './store.ts';

const store = new FileTodoStore(process.env.DATA_FILE ?? 'data/todos.json');
const started = await listen(createTodoServer(store));

console.log(
  `todo web app listening on ${started.url} (data: ${process.env.DATA_FILE ?? 'data/todos.json'})`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    started.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error('shutdown failed', error);
        process.exit(1);
      },
    );
  });
}
