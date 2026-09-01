export const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev-build';

function parseVersion(version: string): number[] {
  return version.replace(/^v/u, '').split('-', 1)[0].split('.').map(Number);
}

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);

  return latestParts.some(
    (part, index) =>
      part > (currentParts[index] ?? 0) &&
      latestParts.slice(0, index).every((value, i) => value === currentParts[i])
  );
}
