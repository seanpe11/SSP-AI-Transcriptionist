// src/shortcuts.ts

import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { emit } from '@tauri-apps/api/event';

export async function setupGlobalShortcuts() {
  // Always unregister previous shortcuts to be safe
  await unregisterAll();

  await register("Ctrl+Shift+F1", (event) => {
    // Instead of calling React state setters, emit a custom event
    emit('shortcut-event', (event.state == 'Pressed') ? 'left-pressed' : 'left-released');
  });

  await register("Ctrl+Shift+F2", (event) => {
    emit('shortcut-event', (event.state == 'Pressed') ? 'center-pressed' : 'center-released');
  });

  await register("Ctrl+Shift+F3", (event) => {
    emit('shortcut-event', (event.state == 'Pressed') ? 'right-pressed' : 'right-released');
  });

  console.log("Global shortcuts registered successfully.");
}