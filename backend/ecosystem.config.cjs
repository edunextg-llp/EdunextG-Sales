// PM2 config: keeps the clustered backend running in the background.
//
//   pm2 start ecosystem.config.cjs     start it
//   pm2 logs bawarchee          see the logs
//   pm2 restart bawarchee       restart after a code change
//   pm2 stop bawarchee          stop it
//
// Keep exec_mode 'fork' and instances 1. src/cluster.js already starts the workers and
// holds the shared captcha / OTP data. PM2's own cluster mode (-i max) would bypass it,
// and captchas and OTPs would fail.
module.exports = {
    apps: [
        {
            name: 'bawarchee',
            script: 'src/cluster.js',
            cwd: __dirname,
            exec_mode: 'fork',
            instances: 1,
            autorestart: true,
            // cluster.js gives workers up to 15 s to finish requests on shutdown.
            kill_timeout: 16000,
            max_memory_restart: '2G',
            time: true, // timestamps in the logs
        },
    ],
};
