# api — zależności

| paczka | wersja | licencja | po co |
|---|---|---|---|
| fastify | 5.12.8 | MIT | serwer HTTP |
| @fastify/cors | 11.4.3 | MIT | CORS tylko dla web |
| @fastify/rate-limit | 11.3.0 | MIT | rate limiting |
| socket.io | 4.8.4 | MIT | powiadomienia real-time |
| drizzle-orm | 0.45.4 | Apache-2.0 | dostęp do Postgresa |
| pg | 8.23.1 | MIT | sterownik Postgres |
| zod | 4.6.7 | MIT | walidacja wejścia i env |
| pino | 10.4.0 | MIT | logger |
| bullmq | 6.7.8 | MIT | kolejka jobów collectora (Valkey) |
| ioredis | 5.11.1 | MIT | sterownik Valkey wymagany przez bullmq 6 (opcjonalny peer) |
| @aws-sdk/client-s3 | 3.1175.0 | Apache-2.0 | klient S3 (SeaweedFS) |
| @aws-sdk/s3-request-presigner | 3.1175.0 | Apache-2.0 | presigned URL screenshotów |
| typescript | 5.9.3 | Apache-2.0 | kompilacja (dev) |
| tsx | 4.23.15 | MIT | uruchamianie TS w dev (dev) |
| @types/node | 22.20.5 | MIT | typy Node (dev) |
| @types/pg | 8.23.1 | MIT | typy pg (dev) |
| eslint | 10.15.0 | MIT | lint (dev) |
| @eslint/js | 10.0.1 | MIT | reguły bazowe ESLint (dev) |
| typescript-eslint | 8.73.0 | MIT | lint TS (dev) |

Obraz bazowy: `node:22.23.5-bookworm-slim`.
