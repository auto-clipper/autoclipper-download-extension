import { BrowserClient, Scope, defaultStackParser, makeFetchTransport } from '@sentry/browser';

let scope: Scope | undefined;
let client: BrowserClient | undefined;

export async function captureExtensionError(error: unknown, operation: string): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  if (!scope) {
    client = new BrowserClient({
      dsn,
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
      release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
      transport: makeFetchTransport,
      stackParser: defaultStackParser,
      integrations: [],
      sendDefaultPii: false,
      tracesSampleRate: 0,
      enableLogs: false,
      beforeSend(event) {
        delete event.request;
        delete event.user;
        delete event.extra;
        delete event.breadcrumbs;
        // Errors can contain signed media URLs or page titles. Keep stack locations only.
        for (const exception of event.exception?.values ?? []) {
          exception.value = 'Extension operation failed';
        }
        return event;
      },
    });
    scope = new Scope();
    scope.setClient(client);
    client.init();
  }
  const eventScope = scope.clone();
  eventScope.setTag('operation', operation);
  eventScope.captureException(error);
  // MV3 service workers may suspend as soon as a message has been acknowledged.
  await client?.flush(2000);
}
