module.exports = {
  apps: [
    {
      name: "card-collection",
      cwd: "/var/www/card-collection",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "9100",
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};
