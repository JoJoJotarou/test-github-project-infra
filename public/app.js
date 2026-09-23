const todosUrl = '/api/todos';
const list = document.querySelector('#todos');
const form = document.querySelector('#new-todo');
const titleInput = document.querySelector('#title');
const errorBox = document.querySelector('#error');
const summary = document.querySelector('#summary');

async function load() {
  const response = await fetch(todosUrl);
  const todos = await response.json();
  render(todos);
}

function render(todos) {
  list.replaceChildren(...todos.map(renderTodo));
  const remaining = todos.filter((todo) => !todo.completed).length;
  summary.textContent = todos.length === 0 ? '' : `${remaining} of ${todos.length} remaining`;
}

function renderTodo(todo) {
  const item = document.createElement('li');
  item.className = todo.completed ? 'done' : '';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = todo.completed;
  toggle.addEventListener('change', () => update(todo.id, { completed: toggle.checked }));

  const label = document.createElement('span');
  label.className = 'title';
  label.textContent = todo.title;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove';
  remove.textContent = 'Delete';
  remove.addEventListener('click', () => destroy(todo.id));

  item.append(toggle, label, remove);
  return item;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

async function create(title) {
  const response = await fetch(todosUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    showError((await response.json()).error);
    return;
  }
  errorBox.hidden = true;
  await load();
}

async function update(id, patch) {
  const response = await fetch(`${todosUrl}/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (response.ok) {
    await load();
  }
}

async function destroy(id) {
  await fetch(`${todosUrl}/${id}`, { method: 'DELETE' });
  await load();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  void create(title);
  form.reset();
  titleInput.focus();
});

void load();
