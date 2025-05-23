const { setFoco, config, main } = require('./core');

(async () => {
    await main();
  await setFoco(config.deviceId, true); // Apagar
})();


