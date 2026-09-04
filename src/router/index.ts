import { createRouter, createWebHistory } from 'vue-router';
import BooruGalleryView from '../views/BooruGalleryView.vue';
import CivitaiBrowserView from '../views/CivitaiBrowserView.vue';
import CivitaiModelDetailView from '../views/CivitaiModelDetailView.vue';
import FaceDetailerView from '../views/FaceDetailerView.vue';
import ImageViewerView from '../views/ImageViewerView.vue';
import RemoveBackgroundView from '../views/RemoveBackgroundView.vue';
import ServerTerminalView from '../views/ServerTerminalView.vue';
import SettingsView from '../views/SettingsView.vue';
import UpscalerView from '../views/UpscalerView.vue';
import WorkflowGeneratorView from '../views/WorkflowGeneratorView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/workflow'
    },
    {
      path: '/workflow',
      name: 'workflow',
      component: WorkflowGeneratorView
    },
    {
      path: '/viewer',
      name: 'viewer',
      component: ImageViewerView
    },
    {
      path: '/booru',
      name: 'booru',
      component: BooruGalleryView
    },
    {
      path: '/civitai',
      name: 'civitai',
      component: CivitaiBrowserView
    },
    {
      path: '/civitai/model/:id',
      name: 'civitai-model-detail',
      component: CivitaiModelDetailView,
      props: true
    },
    {
      path: '/upscaler',
      name: 'upscaler',
      component: UpscalerView
    },
    {
      path: '/remove-background',
      name: 'remove-background',
      component: RemoveBackgroundView
    },
    {
      path: '/face-detailer',
      name: 'face-detailer',
      component: FaceDetailerView
    },
    {
      path: '/server',
      name: 'server',
      component: ServerTerminalView
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView
    }
  ]
});

export default router;
