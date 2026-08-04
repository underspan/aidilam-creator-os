# AIDILAM-DEP-006A: OpenAPI Documentation Auth Fix

## Date
2026-07-24

## Issue
DEP-006 reported `/documentation/json` as accessible without authentication.

## Root Cause
Fastify 5 plugin encapsulation: the `onRequest` hook registered by `authenticationPlugin` was encapsulated and not applied to routes from `@fastify/swagger-ui`.

## Fix Applied (during DEP-006)
Wrapped `authenticationPlugin` with `fastify-plugin` (`fp()`), breaking encapsulation so the authentication hook applies to ALL routes regardless of registration order.

## Validation (DEP-006A)
| Endpoint | No Token | With system.read |
|----------|----------|-----------------|
| /documentation | 401 | 200 |
| /documentation/json | 401 | 200 |
| /documentation/yaml | 401 | 200 |

## No real tokens appear in OpenAPI output
Only the format description `aidl_<prefix>_<secret>` is present.

## Status
**RESOLVED** — no additional code changes needed.
