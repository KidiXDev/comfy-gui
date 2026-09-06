import { VueQueryPlugin } from '@tanstack/vue-query';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import 'vue-sonner/style.css';
import App from './App.vue';
import { queryClient } from './lib/queryClient';
import './main.css';
import router from './router';
import { isNativeBrowserShortcut } from './utils/browserShortcuts';

const app = createApp(App);

if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener(
    'keydown',
    (event) => {
      if (isNativeBrowserShortcut(event)) event.preventDefault();
    },
    { capture: true }
  );
}

app.use(createPinia());
app.use(router);
app.use(VueQueryPlugin, { queryClient });

app.mount('#app');

requestAnimationFrame(() => {
  void getCurrentWindow()
    .show()
    .catch(() => {
      // Browser preview mode.
    });
});
