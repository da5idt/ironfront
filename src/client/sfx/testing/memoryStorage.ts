import type { SettingsStorage } from "../mixer";

/**
 * Stands in for the browser's localStorage (the Web Storage API) in tests:
 * string keys to string values, and getItem gives null for a key never set.
 * `items` is what is stored, for a test to look at.
 */
export function memoryStorage(initial: Record<string, string> = {}): SettingsStorage & { items: Map<string, string> } {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}
