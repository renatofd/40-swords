// PM2 process file at the repository root, for hosts that start the server from the root of a
// pnpm workspace (Colyseus Cloud with Root directory "/", see docs/DEPLOY.md). It is the one in
// apps/server, run from there: same instances, same environment.
const path = require("node:path");

const server = path.join(__dirname, "apps/server");
const { apps } = require("./apps/server/ecosystem.config.cjs");

module.exports = {
  apps: apps.map((app) => ({ ...app, cwd: server, script: path.join(server, app.script) })),
};
