// PM2 Ecosystem Config — Advantix Digital
// Usage: pm2 start ecosystem.config.cjs
// Docs:  https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [
    {
      name: "advantix-api",
      script: "./artifacts/api-server/dist/index.mjs",
      cwd: "./",
      interpreter: "node",
      interpreter_args: "--enable-source-maps",
      env: {
        NODE_ENV: "production",
        PORT: "8080",
      },
      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      // Logging
      out_file: "./logs/api-out.log",
      error_file: "./logs/api-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
};
