const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');

console.log('API KEY:', process.env.OPENAI_API_KEY ? 'found' : 'MISSING');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// CONFIGURE THESE:
const CHANNELS_TO_WATCH = ['1471266339816476765', '1471266265900257413','1471266313031782553']; // channels to summarize

async function fetchAndSummarize() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24 hours

  for (const channelId of CHANNELS_TO_WATCH) {
    const channel = await client.channels.fetch(channelId);
    const messages = await channel.messages.fetch({ limit: 100 });

    // Filter to last 24h and format
    const recent = messages
      .filter(m => m.createdAt > since && !m.author.bot)
      .map(m => `${m.author.username}: ${m.content}`)
      .reverse()
      .join('\n');

    if (!recent) continue;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Summarize the key topics and highlights from this Discord conversation in 3-5 bullet points:\n\n${recent}`
        }]
      });
      
      const summary = response.choices[0].message.content;

    // Post to summary channel
    const summaryChannel = await client.channels.fetch(SUMMARY_CHANNEL_ID);
    await summaryChannel.send(`📋 **Daily Summary for #${channel.name}**\n\n${summary}`);
  }
}

// Run every day at 9am
cron.schedule('0 9 * * *', () => {
  console.log('Running daily summary...');
  fetchAndSummarize();
});

client.once('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);