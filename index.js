// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require('discord.js');
const fetch = global.fetch ?? require('node-fetch');

// ===== ENV =====
const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || '!';
const AUTO_REPLY = (process.env.AUTO_REPLY || 'off').toLowerCase() === 'on';
const ALLOWED_CHANNELS = (process.env.AUTO_REPLY_CHANNELS || '').split(',').map(s => s.trim()).filter(Boolean);
const AUTO_MODE = (process.env.AUTO_REPLY_MODE || 'loose').toLowerCase(); // 'loose' | 'strict'
const COOLDOWN_S = Number(process.env.AUTO_REPLY_COOLDOWN_SECONDS || 10);
const MAX_PER_MIN = Number(process.env.AUTO_REPLY_MAX_PER_MIN || 10);
const USE_THREADS = (process.env.AUTO_REPLY_USE_THREADS || 'off').toLowerCase() === 'on';
const DEBUG = (process.env.DEBUG || 'off').toLowerCase() === 'on';

const GEMINI_PROVIDER = (process.env.GEMINI_PROVIDER || 'google').toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 256);
const GEMINI_MAX_INPUT_CHARS = Number(process.env.GEMINI_MAX_INPUT_CHARS || 3500);
const GENERIC_ENDPOINT = process.env.GEMINI_ENDPOINT || '';

if (!TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

// ===== DISCORD CLIENT =====
const client = new Client({
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent ],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🤖 Auto-reply: ${AUTO_REPLY ? 'ON' : 'OFF'} (${AUTO_MODE})`);
  console.log(`📺 Allowed channels: ${ALLOWED_CHANNELS.length ? ALLOWED_CHANNELS.join(', ') : 'ALL'}`);
});

// ===== CAMP DATA (edit as needed) =====
const CAMP = {
  title: 'AC x KMUTT Rocket Camp 2025 — Operated by DTI',
  desc: [
    'ค่ายพัฒนาด้านวิศวกรรมศาสตร์ ชวนสัมผัสโปรเจคอวกาศจนกลายเป็นวิศวกรตัวจริง!',
    'ร่วมมือ: SPACE AC × KMUTT × DTI × PTT',
    'ภารกิจ: ออกแบบ/สร้าง/ทดสอบ Sounding Rocket ขนาด 5 นิ้ว ยาว ~1.5 ม. ยิงสูง ~1 กม.',
  ].join('\n'),
  where1: 'Workshop 1–3 ต.ค. 2025 @ โรงเรียนอัสสัมชัญ',
  where2: 'Launch 6–10 ต.ค. 2025 @ วังจันทร์วัลเลย์ จ.ระยอง',
  forms: {
    individual: 'https://go.spaceac.tech/rocket-camp-2025-form',
    team: 'https://go.spaceac.tech/rocket-camp-2025-team',
    line: 'https://lin.ee/W4dKV7D',
    facebook: 'https://go.spaceac.tech/facebook',
  },
  pricing: { spectator: 2000, individual: 12345, team: 100000 },
};

const VENUES = [
  { name: 'วังจันทร์วัลเลย์ ระยอง (Wangchan Valley)', url: 'https://maps.app.goo.gl/rmx8v35oLzxpFVXx7' },
  { name: 'The EnCony @Wangchan Valley (ที่พัก)', url: 'https://maps.app.goo.gl/Kyy2FwxVzWXQaRvx9' },
  { name: 'ศูนย์ DREAM Maker Space @โรงเรียนอัสสัมชัญ', url: 'https://maps.app.goo.gl/YWmYkq8vHaWsAeyN9' },
];

// Minimal schedule (keep it short to save tokens)
const SCHEDULE_SUMMARY = 'Workshop 1–3 ต.ค. 2568, Launch 6–10 ต.ค. 2568 @ วังจันทร์วัลเลย์';

// ===== Knowledge Base (Thai-first) =====
const KB = [
  {
    keys: ['ค่ายคืออะไร', 'เกี่ยวกับค่าย', 'about', 'rocketcamp', 'rocket camp'],
    answer: () => [
      'ℹ️ **เกี่ยวกับค่าย AC x KMUTT Rocket Camp 2025 (Operated by DTI)**',
      CAMP.desc,
      `📍 ${CAMP.where1}`,
      `📍 ${CAMP.where2}`,
      `📝 สมัคร: เดี่ยว ${CAMP.forms.individual} | ทีม ${CAMP.forms.team}`,
    ].join('\n'),
  },
  {
    keys: ['ราคา', 'ค่าสมัคร', 'price', 'pricing', 'spectator'],
    answer: () =>
      [
        '💰 **ค่าสมัคร / Pricing**',
        `• Spectator: **${CAMP.pricing.spectator.toLocaleString()}** บาท`,
        `• เดี่ยว: **${CAMP.pricing.individual.toLocaleString()}** บาท`,
        `• ทีม (5–7 คน): **${CAMP.pricing.team.toLocaleString()}** บาท`,
      ].join('\n'),
  },
  {
    keys: ['สมัคร', 'apply', 'form', 'ลงทะเบียน', 'register'],
    answer: () => `📝 เดี่ยว: ${CAMP.forms.individual}\n👥 ทีม: ${CAMP.forms.team}`,
  },
  {
    keys: ['ติดต่อ', 'contact', 'line', 'facebook'],
    answer: () => `💬 LINE OA: ${CAMP.forms.line}\nFacebook: ${CAMP.forms.facebook}`,
  },
  {
    keys: ['แผนที่', 'สถานที่', 'ที่ไหน', 'where', 'venue', 'map'],
    answer: () => VENUES.map(v => `• ${v.name}: ${v.url}`).join('\n'),
  },
  {
    keys: ['ตาราง', 'กำหนดการ', 'schedule', 'วันไหน', 'launch', 'workshop'],
    answer: () => `📆 กำหนดการย่อ: ${SCHEDULE_SUMMARY}\nพิมพ์ \`${PREFIX}rocketcamp\` เพื่อดูภาพรวม`,
  },
];

function findKBAnswer(q) {
  const t = (q || '').toLowerCase();
  for (const item of KB) {
    if (item.keys.some(k => t.includes(k.toLowerCase()))) return item.answer();
  }
  return null;
}

// ===== Embeds (used by ! commands) =====
function makeOverviewEmbed() {
  return new EmbedBuilder()
    .setTitle('🚀 AC x KMUTT Rocket Camp 2025 — Operated by DTI')
    .setDescription(CAMP.desc)
    .addFields(
      { name: 'สถานที่/เวลา', value: `• ${CAMP.where1}\n• ${CAMP.where2}` },
      { name: 'ค่าสมัคร', value: `Spectator: ${CAMP.pricing.spectator} บาท\nเดี่ยว: ${CAMP.pricing.individual} บาท\nทีม: ${CAMP.pricing.team} บาท` },
      { name: 'ลิงก์สมัคร', value: `เดี่ยว: ${CAMP.forms.individual}\nทีม: ${CAMP.forms.team}` },
    )
    .setFooter({ text: 'สอบถาม: LINE OA @spaceac | Facebook: go.spaceac.tech/facebook' });
}

function makeVenueEmbed() {
  return new EmbedBuilder()
    .setTitle('🗺️ สถานที่ / Venues')
    .setDescription(VENUES.map(v => `• [${v.name}](${v.url})`).join('\n'));
}

// ===== Utils =====
function debugLog(...args) { if (DEBUG) console.log('[DBG]', ...args); }

function truncate(str, limit) {
  if (!str) return '';
  if (str.length <= limit) return str;
  return str.slice(0, limit - 12) + '\n...[truncated]';
}

function buildGeminiContext(question) {
  const parts = [
    'You are the info bot for "AC x KMUTT Rocket Camp 2025 — Operated by DTI".',
    'Answer in Thai, concise and accurate. Use short bullet points when appropriate.',
    `Overview:\n${CAMP.desc}`,
    `Venues:\n- ${VENUES[0].name}: ${VENUES[0].url}`,
    `Pricing: spectator ${CAMP.pricing.spectator} THB, individual ${CAMP.pricing.individual} THB, team ${CAMP.pricing.team} THB`,
    `Apply: individual ${CAMP.forms.individual} | team ${CAMP.forms.team}`,
    `Schedule (short): ${SCHEDULE_SUMMARY}`,
    `Question: ${question}`,
  ].join('\n');

  return truncate(parts, GEMINI_MAX_INPUT_CHARS);
}

// ===== Gemini (token-limited) =====
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error('Gemini not configured');

  if (GEMINI_PROVIDER === 'google') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS, // limit output tokens
        temperature: 0.2,
        topP: 0.9,
        topK: 40
      }
      // safetySettings: [] // add if you need
    };

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}: ${await resp.text().catch(() => '<no body>')}`);
    const json = await resp.json();
    const parts = json.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text).filter(Boolean).join('\n').trim();
    return text || 'ไม่มีข้อมูล';
  }

  // Generic custom endpoint (if you ever use one)
  if (!GENERIC_ENDPOINT) throw new Error('Generic endpoint not set');
  const resp = await fetch(GENERIC_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, max_tokens: GEMINI_MAX_OUTPUT_TOKENS, temperature: 0.2 }),
  });
  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}: ${await resp.text().catch(() => '<no body>')}`);
  const json = await resp.json();
  return json.text || json.output || JSON.stringify(json);
}

// ===== Rate limiting =====
const perUserCooldown = new Map();   // key: `${channelId}:${userId}` -> timestamp
const perChannelBuckets = new Map(); // key: channelId -> { count, windowStartMs }

function canReply(channelId, userId) {
  const now = Date.now();

  const key = `${channelId}:${userId}`;
  const last = perUserCooldown.get(key) || 0;
  if (now - last < COOLDOWN_S * 1000) return false;

  let b = perChannelBuckets.get(channelId);
  if (!b || now - b.windowStartMs > 60_000) {
    b = { count: 0, windowStartMs: now };
  }
  if (b.count >= MAX_PER_MIN) return false;

  perUserCooldown.set(key, now);
  b.count += 1;
  perChannelBuckets.set(channelId, b);
  return true;
}

// ===== Auto-reply gates =====
function channelAllowed(channel) {
  if (!AUTO_REPLY) return false;
  if (!ALLOWED_CHANNELS.length) return true;
  return ALLOWED_CHANNELS.includes(channel.id);
}

function isMentioningBot(message) {
  try {
    return message.mentions?.users?.has(client.user.id);
  } catch { return false; }
}

function looksLikeQuestionStrict(text) {
  const t = (text || '').trim().toLowerCase();
  return /[?？]$/.test(t) ||
    /(ราคา|ค่าสมัคร|สมัคร|ตาราง|กำหนดการ|ที่ไหน|ติดต่อ|line|facebook|วังจันทร์|kmutt|dti|space\s?ac|rocket|จรวด|camp|register|price|where|when|how)/i.test(t);
}

function shouldAutoReply(content, wasMentioned) {
  if (wasMentioned) return true; // always reply if bot is mentioned
  if (AUTO_MODE === 'strict') return looksLikeQuestionStrict(content);
  // loose: reply to most sensible non-empty lines (avoid pure emojis/1-char)
  const t = (content || '').trim();
  if (!t) return false;
  if (t.length <= 2) return false;
  // if it has letters/numbers or Thai chars, allow
  return looksLikeQuestionStrict(t) || /[A-Za-zก-ฮ0-9]/.test(t);
}

// ===== Commands + Auto-reply =====
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    const type = message.channel?.type;
    // Allow common text surfaces
    const textlike = [
      ChannelType.GuildText,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.AnnouncementThread,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildForum // forum posts create threads; message is in a thread
    ];
    if (!textlike.includes(type)) return;

    const content = message.content || '';

    // ----- Commands (prefix !) -----
    if (content.startsWith(PREFIX)) {
      const args = content.slice(PREFIX.length).trim().split(/\s+/);
      const cmd = (args.shift() || '').toLowerCase();

      if (cmd === 'help') {
        return message.reply(
          [
            'คำสั่ง:',
            `• \`${PREFIX}rocketcamp\` — ภาพรวมค่าย`,
            `• \`${PREFIX}price\` — ค่าสมัคร`,
            `• \`${PREFIX}apply\` — สมัคร`,
            `• \`${PREFIX}contact\` — ติดต่อ`,
            `• \`${PREFIX}venue\` — สถานที่/แผนที่`,
            `• \`${PREFIX}ask <คำถาม>\` — ถาม AI (ใช้ Gemini; โหมดประหยัดโควต้า)`,
          ].join('\n')
        );
      }

      if (cmd === 'rocketcamp') return message.channel.send({ embeds: [makeOverviewEmbed()] });
      if (cmd === 'price') {
        return message.reply(
          `💰 ค่าสมัคร:\n- Spectator: ${CAMP.pricing.spectator} บาท\n- เดี่ยว: ${CAMP.pricing.individual} บาท\n- ทีม (5–7 คน): ${CAMP.pricing.team} บาท`
        );
      }
      if (cmd === 'apply') {
        return message.reply(`📝 สมัคร:\nเดี่ยว: ${CAMP.forms.individual}\nทีม: ${CAMP.forms.team}`);
      }
      if (cmd === 'contact') {
        return message.reply(`💬 ติดต่อ:\nLINE: ${CAMP.forms.line}\nFacebook: ${CAMP.forms.facebook}`);
      }
      if (cmd === 'venue') return message.channel.send({ embeds: [makeVenueEmbed()] });

      if (cmd === 'ask') {
        const q = args.join(' ');
        if (!q) return message.reply(`ใช้: \`${PREFIX}ask <คำถาม>\``);

        // KB first (free)
        const kb = findKBAnswer(q);
        if (kb) return message.reply(truncate(kb, 1900));

        if (!GEMINI_API_KEY) return message.reply('❌ ยังไม่ตั้งค่า Gemini ใน .env');
        await message.channel.sendTyping();
        try {
          const ctx = buildGeminiContext(q);
          const ans = await callGemini(ctx);
          return message.reply(truncate(ans, 1900));
        } catch (e) {
          console.error('Gemini error:', e);
          return message.reply('⚠️ เรียก Gemini ไม่สำเร็จ');
        }
      }

      // unknown command ignored
      return;
    }

    // ----- Auto-reply (no prefix) -----
    if (!channelAllowed(message.channel)) { debugLog('skip: channel not allowed'); return; }
    const mentioned = isMentioningBot(message);
    if (!shouldAutoReply(content, mentioned)) { debugLog('skip: gate not matched'); return; }
    if (!canReply(message.channel.id, message.author.id)) { debugLog('skip: rate limit'); return; }

    await message.channel.sendTyping();

    // 1) KB (free)
    const kbAns = findKBAnswer(content);
    if (kbAns) return message.reply(truncate(kbAns, 1900));

    // 2) Gemini (paid/free quota) — only if key exists
    if (GEMINI_API_KEY) {
      const ctx = buildGeminiContext(content);
      try {
        const llm = await callGemini(ctx);
        return message.reply(truncate(llm, 1900));
      } catch (e) {
        console.error('Gemini error:', e);
        // fall through
      }
    }

    // 3) Fallback (no LLM)
    return message.reply(
      `ขอบคุณสำหรับคำถาม 🙌 ลองใช้คำสั่ง: \`${PREFIX}rocketcamp\`, \`${PREFIX}price\`, \`${PREFIX}apply\`, \`${PREFIX}contact\``
    );

  } catch (err) {
    console.error('Handler error:', err);
  }
});

// ===== START =====
client.login(TOKEN);
