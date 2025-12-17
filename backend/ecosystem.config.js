module.exports = {
  apps: [{
    name: 'yugioh-backend',
    script: './dist/main.js',
    instances: 'max', // Usar todos os cores disponíveis
    exec_mode: 'cluster', // Modo cluster para balanceamento de carga
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '2G', // Reiniciar se usar mais de 2GB
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    // Otimizações para alta concorrência
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    // Graceful shutdown
    shutdown_with_message: true
  }]
};
