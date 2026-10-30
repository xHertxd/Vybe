import { createVybeServer } from './app.js';
import { config } from './config.js';

const { server } = createVybeServer();

server.listen(config.port, () => {
  console.log(`Vybe server listening on http://localhost:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
});

function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down Vybe server.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
