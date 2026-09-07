import { onUnmounted, ref } from 'vue';
export function useImageClipboard() {
  const copySuccess = ref(false);
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyImageToClipboard(url?: string) {
    const targetUrl = url;
    if (!targetUrl) return;
    try {
      const res = await fetch(targetUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      copySuccess.value = true;
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        copySuccess.value = false;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error);
    }
  }

  onUnmounted(() => clearTimeout(feedbackTimer));
  return { copySuccess, copyImageToClipboard };
}
