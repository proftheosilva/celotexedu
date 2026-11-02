import 'dotenv/config';
import { createAdminClient } from '@insforge/sdk';
import { createApp } from './app.js';
import { readRuntimeConfig } from './config.js';

const config = readRuntimeConfig();
const insforge = createAdminClient({ baseUrl: config.baseUrl, apiKey: config.apiKey });
const app = createApp({ db: insforge.database, production: config.environment === 'production' });

const server = app.listen(config.port, config.host, () => {
  console.log(`celotexEDU ouvindo em http://${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.log(`Recebido ${signal}; finalizando celotexEDU.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
