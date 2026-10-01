# Autoclipper Download Extension

## Self-hosted Sentry

Project `autoclipper-download-extension` in the `autoclipper` organization at https://sentry.nihey.org.
Set `VITE_SENTRY_DSN` from the project client key; leave blank to disable reporting.
Use the matching `*_ENVIRONMENT` and `*_RELEASE` variables to identify deployments.
New monitoring captures errors only: traces, replay, logs and default PII are disabled; request, user, extra and breadcrumb payloads are removed.
Public DSNs are build-time values: rebuild the browser bundle after changing them. Never prefix an auth token with `VITE_` or `NEXT_PUBLIC_`.
Only extension-owned download failures and popup render errors are captured through an isolated client. Content scripts and the MAIN-world interceptor never initialize Sentry; no extra Chrome permissions are needed. Error values are redacted so titles, URLs, history and account data stay local. Update the store privacy disclosures when publishing the monitoring-enabled build.
No production environment values are changed by this code; configure the deployment environment before rollout.
