module.exports = {
  apps: [
    {
      name: "xiangqi-server",
      script: "server.js",
      cwd: "/var/www/Quarkbobo/xiangqi-server",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
