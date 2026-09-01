import { getCurrentWindow } from '@tauri-apps/api/window';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import './main.css';
import router from './router';

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');

requestAnimationFrame(() => {
  void getCurrentWindow()
    .show()
    .catch(() => {
      // Browser preview mode.
    });
});
