/**
 * PM2 Ecosystem Configuration
 *
 * Development:
 *   Server: pm2 start ecosystem.config.js --only blockgame-server-dev
 *   UI:     pm2 start ecosystem.config.js --only blockgame-ui-dev
 *
 * Production (serve built files):
 *   Server: pm2 start ecosystem.config.js --only blockgame-server-prod
 *   UI:     pm2 start ecosystem.config.js --only blockgame-ui-prod
 *
 * Monitor: pm2 monit
 * Logs:    pm2 logs <app-name>
 * Stop:    pm2 stop <app-name>
 * Restart: pm2 restart <app-name>
 */

module.exports = {
  apps: [
    // ========================================
    // SERVER - Development Mode
    // ========================================
    {
      name: 'blockgame-server-dev',
      script: 'bun',
      args: 'packages/server/src/index.ts',
      cwd: './',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      env: {
        NODE_ENV: 'development',
        PORT: '7001',
      },

      error_file: './logs/server-dev-error.log',
      out_file: './logs/server-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      exec_mode: 'fork',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      listen_timeout: 10000,
      kill_timeout: 5000,
      source_map_support: true,
    },

    // ========================================
    // SERVER - Production Mode (Built Files)
    // ========================================
    {
      name: 'blockgame-server-prod',
      script: 'bun',
      args: 'packages/server/dist/index.js',
      cwd: './',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      env: {
        NODE_ENV: 'production',
        PORT: '7001',
      },

      error_file: './logs/server-prod-error.log',
      out_file: './logs/server-prod-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      exec_mode: 'fork',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },

    // ========================================
    // UI - Development Mode (Vite Dev Server)
    // ========================================
    {
      name: 'blockgame-ui-dev',
      script: 'bun',
      args: 'run dev',
      cwd: './packages/ui',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',

      env: {
        NODE_ENV: 'development',
      },

      error_file: '../../logs/ui-dev-error.log',
      out_file: '../../logs/ui-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      exec_mode: 'fork',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },

    // ========================================
    // UI - Production Mode (Bun Static File Server)
    // ========================================
    {
      name: 'blockgame-ui-prod',
      script: 'bun',
      args: 'run serve',
      cwd: './packages/ui',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',

      env: {
        NODE_ENV: 'production',
      },

      error_file: '../../logs/ui-prod-error.log',
      out_file: '../../logs/ui-prod-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      exec_mode: 'fork',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
