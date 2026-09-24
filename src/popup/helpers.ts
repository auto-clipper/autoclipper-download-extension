import { APP_URL } from '@/shared/constants';

export const t = (key: string, subs?: string[]) => chrome.i18n.getMessage(key, subs) || key;

export function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

export function sendToAppUrl(videoUrl: string, medium: string): string {
  return (
    `${APP_URL}/projects?video=${encodeURIComponent(videoUrl)}` +
    `&utm_source=chrome-extension&utm_medium=${medium}`
  );
}
