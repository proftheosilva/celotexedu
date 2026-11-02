module.exports = {
  apps: [
    {
      name: 'celotexedu',
      cwd: __dirname,
      script: 'server/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '250M',
      min_uptime: '10s',
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        HOST: '172.18.0.1',
        PORT: '4180',
      },
    },
  ],
};
