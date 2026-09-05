export function isNativeBrowserShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
  >
): boolean {
  const key = event.key.toLowerCase();
  const command = event.ctrlKey || event.metaKey;
  return (
    ['f3', 'f5', 'f7', 'f12'].includes(key) ||
    (command &&
      [
        'r',
        'p',
        's',
        'o',
        'u',
        'f',
        'g',
        'h',
        'j',
        '+',
        '-',
        '=',
        '0'
      ].includes(key)) ||
    (command && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
    (event.altKey && ['arrowleft', 'arrowright', 'home'].includes(key))
  );
}
