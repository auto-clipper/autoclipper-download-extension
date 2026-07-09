import type { MediaItem, ProviderId } from '@/shared/types';

export interface Provider {
  id: ProviderId;
  /** Hostnames (suffix match) this provider handles. */
  hosts: string[];
  /**
   * Extract media candidates from an intercepted JSON API response body.
   * Must never throw — malformed payloads return [].
   */
  extractFromJson(body: string, pageUrl: string): MediaItem[];
}

export function matchesHost(provider: Provider, hostname: string): boolean {
  return provider.hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}
