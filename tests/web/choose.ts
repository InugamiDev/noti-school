import type { Locator } from '../../apps/web/node_modules/@playwright/test/index.mjs';

// The clay select is a combobox with a listbox popup, not a native <select>.
export async function choose(control: Locator, option: string) {
  await control.click();
  await control.page().getByRole('option', { name: option, exact: true }).click();
}
