import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('adds, completes, and deletes a todo', async ({ page }) => {
  await page.getByPlaceholder('What needs doing?').fill('write the evaluation report');
  await page.getByRole('button', { name: 'Add' }).click();

  const item = page.getByRole('listitem').filter({ hasText: 'write the evaluation report' });
  await expect(item).toHaveCount(1);
  await expect(page.getByText('1 of 1 remaining')).toBeVisible();

  await item.getByRole('checkbox').check();
  await expect(page.getByText('0 of 1 remaining')).toBeVisible();
  await expect(item).toHaveClass(/done/);

  await item.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await expect(page.getByText('1 of 1 remaining')).toBeHidden();
});

test('surfaces a validation error instead of adding an empty todo', async ({ page }) => {
  await page.getByPlaceholder('What needs doing?').fill('   ');
  await page.getByRole('button', { name: 'Add' }).click();

  await expect(page.locator('#error')).toHaveText('title must not be empty');
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('keeps todos after a reload', async ({ page }) => {
  await page.getByPlaceholder('What needs doing?').fill('persisted todo');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);

  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: 'persisted todo' })).toHaveCount(1);
});
