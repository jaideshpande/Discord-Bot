const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

console.log('API KEY:', process.env.OPENAI_API_KEY ? 'found' : 'MISSING');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// CONFIGURE THESE:
const CHANNELS_TO_WATCH = ['1471266339816476765', '1471266265900257413','1471266313031782553']; // channels to summarize


//const SUMMARY_CHANNEL_ID = process.env.SUMMARY_CHANNEL_ID;

const LAST_SENT_FILE = path.join(process.cwd(), 'last-summary-sent.json');
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function getLastSummarySent() {
  try {
    const data = fs.readFileSync(LAST_SENT_FILE, 'utf8');
    const { sentAt } = JSON.parse(data);
    return sentAt ? new Date(sentAt) : null;
  } catch {
    return null;
  }
}

function setLastSummarySent() {
  fs.writeFileSync(LAST_SENT_FILE, JSON.stringify({ sentAt: new Date().toISOString() }));
}

async function fetchAndSummarize() {
  const lastSent = getLastSummarySent();
  if (lastSent && (Date.now() - lastSent.getTime() < TWENTY_FOUR_HOURS_MS)) {
    console.log('Skipping summary: last sent within 24 hours at', lastSent.toISOString());
    return;
  }

  const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS); // last 24 hours

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
          content: `You are a bot living inside a Discord server of young entrepreneurs building 
          and selling AI Automations, ad management services, 
          lead generation software for salespeople, or similar digital services. Your job is to read all the past days' 
          chats in a Discord channel and summarize them in three to five bullet points :\n\n${recent}`
        }]
      });
      
      const summary = response.choices[0].message.content;

    // Post to summary channel
    // const summaryChannel = await client.channels.fetch(SUMMARY_CHANNEL_ID);
    // await summaryChannel.send(`📋 **Daily Summary for #${channel.name}**\n\n${summary}`);
      await channel.send(`📋 **Daily Summary for #${channel.name}**\n\n${summary}`);
  }

  setLastSummarySent();
  console.log('Summary sent; next send allowed after 24 hours or at 9:00 AM.');
}

// Run every day at 9:00 AM
cron.schedule('0 9 * * *', () => {
  console.log('Running daily summary (9 AM)...');
  fetchAndSummarize();
});

client.once('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);
  // Run once on startup: if no summary in past 24h, send now (e.g. after fixing API key / redeploy)
  fetchAndSummarize();
});

client.login(process.env.DISCORD_TOKEN);