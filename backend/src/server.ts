import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { attachDeploymentSocket } from './realtime/deployment-socket.js';

const app = createApp();
const server = createServer(app);
attachDeploymentSocket(server);

server.listen(env.port, () => {
  console.log(`DeployFlow API listening on port ${String(env.port)}`);
});
