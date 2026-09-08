import type { InjectionKey } from 'vue';
import { inject, shallowRef } from 'vue';

export interface ConfirmDialogOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export type ConfirmDialog = (options: ConfirmDialogOptions) => Promise<boolean>;

export const confirmDialogKey: InjectionKey<ConfirmDialog> =
  Symbol('confirm-dialog');

export function createConfirmDialog() {
  const open = shallowRef(false);
  const options = shallowRef<ConfirmDialogOptions>({
    title: '',
    description: ''
  });
  let resolveConfirmation: ((confirmed: boolean) => void) | null = null;

  function finish(confirmed: boolean) {
    const resolve = resolveConfirmation;
    resolveConfirmation = null;
    open.value = false;
    resolve?.(confirmed);
  }

  function confirm(nextOptions: ConfirmDialogOptions) {
    finish(false);
    options.value = nextOptions;
    open.value = true;
    return new Promise<boolean>((resolve) => {
      resolveConfirmation = resolve;
    });
  }

  return { open, options, confirm, finish };
}

export function useConfirmDialog() {
  const confirm = inject(confirmDialogKey);
  if (!confirm) throw new Error('ConfirmDialogProvider is missing');
  return { confirm };
}
