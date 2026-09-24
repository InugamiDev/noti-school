// intent: declaration only; coordinator uses the existing user's PM2 daemon.
const root = '/home/inu/projects/noti-school';
const common = {
  cwd: `${root}/current`, exec_mode: 'fork', instances: 1,
  autorestart: true, restart_delay: 3000, max_restarts: 5, min_uptime: '30s',
  kill_timeout: 15000, listen_timeout: 10000, max_memory_restart: '512M',
  time: true, merge_logs: true,
};
module.exports = { apps: [
  { ...common, name: 'noti-school-api', script: `${root}/current/bin/noti-school-api`, interpreter: 'none',
    env: { NOTI_ENV_FILE: `${root}/shared/api.env` },
    out_file: `${root}/shared/logs/api-out.log`, error_file: `${root}/shared/logs/api-error.log` },
  { ...common, name: 'noti-school-auth', script: `${root}/current/apps/auth/dist/server.js`, interpreter: 'node',
    node_args: `--env-file=${root}/shared/auth.env`, env: { NODE_ENV: 'production' },
    out_file: `${root}/shared/logs/auth-out.log`, error_file: `${root}/shared/logs/auth-error.log` },
] };
