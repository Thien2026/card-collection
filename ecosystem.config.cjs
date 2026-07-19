module.exports = {
  apps: [
    {
      name: "card-collection",
      cwd: "/var/www/card-collection",
      script: ".next/standalone/server.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "9100",
        HOSTNAME: "127.0.0.1",
        UPLOADS_ROOT: "/var/www/card-data/uploads",
      },
    },
  ],
};
