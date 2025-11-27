import { BotClient } from './BotClient';

/**
 * Bot Configuration
 * Easily customize bot behavior here
 */
const CONFIG = {
  // Server connection
  serverUrl: process.env.SERVER_URL || 'ws://localhost:3000',
  roomName: process.env.ROOM_NAME || 'firegroup',

  // Bot spawning
  botCount: parseInt(process.env.BOT_COUNT || '20', 10),
  spawnDelayMs: parseInt(process.env.SPAWN_DELAY_MS || '100', 10), // Delay between spawning bots

  // Lifecycle
  autoDisconnect: process.env.AUTO_DISCONNECT === 'true',
  disconnectAfterMs: parseInt(process.env.DISCONNECT_AFTER_MS || '60000', 10), // 1 minute default
};

/**
 * Spawn bot clients
 */
async function spawnBots() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🤖 BlockGame Bot Client');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Server URL:       ${CONFIG.serverUrl}`);
  console.log(`Room Name:        ${CONFIG.roomName}`);
  console.log(`Bot Count:        ${CONFIG.botCount}`);
  console.log(`Spawn Delay:      ${CONFIG.spawnDelayMs}ms`);
  console.log(`Auto Disconnect:  ${CONFIG.autoDisconnect ? 'Yes' : 'No'}`);
  if (CONFIG.autoDisconnect) {
    console.log(`Disconnect After: ${CONFIG.disconnectAfterMs}ms`);
  }
  console.log('═══════════════════════════════════════════════════════\n');

  const bots: BotClient[] = [];

  // Spawn bots with delay
  for (let i = 1; i <= CONFIG.botCount; i++) {
    const botName = `Bot${i}`;
    const bot = new BotClient(CONFIG.serverUrl, botName);

    try {
      await bot.connect(CONFIG.roomName);
      bots.push(bot);

      console.log(`[SPAWN] ✓ Bot ${i}/${CONFIG.botCount} spawned (${botName})`);

      // Wait before spawning next bot to avoid overwhelming server
      if (i < CONFIG.botCount) {
        await sleep(CONFIG.spawnDelayMs);
      }
    } catch (error) {
      console.error(`[SPAWN] ✗ Failed to spawn ${botName}:`, error);
    }
  }

  console.log(`\n[SPAWN] ✓ All bots spawned! Total connected: ${bots.length}/${CONFIG.botCount}`);

  // Auto-disconnect after timeout
  if (CONFIG.autoDisconnect) {
    console.log(`[SPAWN] ⏱  Bots will auto-disconnect in ${CONFIG.disconnectAfterMs}ms\n`);

    setTimeout(async () => {
      console.log('\n[SHUTDOWN] Auto-disconnect timeout reached. Disconnecting all bots...');
      await disconnectAllBots(bots);
    }, CONFIG.disconnectAfterMs);
  } else {
    console.log('[SPAWN] ℹ  Bots will run indefinitely. Press Ctrl+C to stop.\n');
  }

  // Graceful shutdown on Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\n[SHUTDOWN] Received SIGINT. Disconnecting all bots...');
    await disconnectAllBots(bots);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[SHUTDOWN] Received SIGTERM. Disconnecting all bots...');
    await disconnectAllBots(bots);
  });
}

/**
 * Disconnect all bots gracefully
 */
async function disconnectAllBots(bots: BotClient[]): Promise<void> {
  console.log(`[SHUTDOWN] Disconnecting ${bots.length} bots...`);

  // Disconnect all bots in parallel
  await Promise.all(
    bots.map(async (bot, index) => {
      try {
        await bot.disconnect();
        console.log(`[SHUTDOWN] ✓ Bot ${index + 1}/${bots.length} disconnected`);
      } catch (error) {
        console.error(`[SHUTDOWN] ✗ Failed to disconnect bot ${index + 1}:`, error);
      }
    })
  );

  console.log('[SHUTDOWN] ✓ All bots disconnected. Goodbye!\n');
  process.exit(0);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start the bot swarm!
spawnBots().catch((error) => {
  console.error('[ERROR] Fatal error:', error);
  process.exit(1);
});
