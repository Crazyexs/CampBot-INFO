// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require('discord.js');
const fetch = global.fetch ?? require('node-fetch');

// ===== ENV =====
const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || '!';
const AUTO_REPLY = (process.env.AUTO_REPLY || 'off').toLowerCase() === 'on';
const ALLOWED_CHANNELS = (process.env.AUTO_REPLY_CHANNELS || '').split(',').map(s => s.trim()).filter(Boolean);
const AUTO_MODE = (process.env.AUTO_REPLY_MODE || 'all').toLowerCase(); // all | loose | strict
const COOLDOWN_S = Number(process.env.AUTO_REPLY_COOLDOWN_SECONDS || 8);
const MAX_PER_MIN = Number(process.env.AUTO_REPLY_MAX_PER_MIN || 20);
const USE_THREADS = (process.env.AUTO_REPLY_USE_THREADS || 'off').toLowerCase() === 'on';
const DEBUG = (process.env.DEBUG || 'off').toLowerCase() === 'on';

const GEMINI_PROVIDER = (process.env.GEMINI_PROVIDER || 'google').toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 256);
const GEMINI_MAX_INPUT_CHARS = Number(process.env.GEMINI_MAX_INPUT_CHARS || 3000);
const GENERIC_ENDPOINT = process.env.GEMINI_ENDPOINT || '';

if (!TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

// ===== DISCORD CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🤖 Auto-reply: ${AUTO_REPLY ? 'ON' : 'OFF'} (${AUTO_MODE})`);
  console.log(`📺 Allowed channels: ${ALLOWED_CHANNELS.length ? ALLOWED_CHANNELS.join(', ') : 'ALL'}`);
});

function dlog(...a){ if (DEBUG) console.log('[DBG]', ...a); }

// ===== CAMP DATA =====
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
const SCHEDULE_SUMMARY = 'Workshop 1–3 ต.ค. 2568 (3 วัน) และ Launch 6–10 ต.ค. 2568 (5 วัน) รวม 8 วัน';
const VENUES = [
  { name: 'วังจันทร์วัลเลย์ ระยอง (Wangchan Valley)', url: 'https://maps.app.goo.gl/rmx8v35oLzxpFVXx7' },
  { name: 'The EnCony @Wangchan Valley (ที่พัก)', url: 'https://maps.app.goo.gl/Kyy2FwxVzWXQaRvx9' },
  { name: 'ศูนย์ DREAM Maker Space @โรงเรียนอัสสัมชัญ', url: 'https://maps.app.goo.gl/YWmYkq8vHaWsAeyN9' },
];

// ===== KB (ครอบคลุม "วันที่จัด/กี่วัน") =====
const KB = [
  {
    keys: ['ค่ายคืออะไร','เกี่ยวกับค่าย','about','rocketcamp','rocket camp'],
    answer: () => [
      'ℹ️ **เกี่ยวกับค่าย AC x KMUTT Rocket Camp 2025**',
      CAMP.desc,
      `📍 ${CAMP.where1}`,
      `📍 ${CAMP.where2}`,
      `📝 สมัคร: เดี่ยว ${CAMP.forms.individual} | ทีม ${CAMP.forms.team}`,
    ].join('\n'),
  },
  {
    keys: ['ราคา','ค่าสมัคร','price','pricing','spectator'],
    answer: () => [
      '💰 **ค่าสมัคร / Pricing**',
      `• Spectator: **${CAMP.pricing.spectator.toLocaleString()}** บาท`,
      `• เดี่ยว: **${CAMP.pricing.individual.toLocaleString()}** บาท`,
      `• ทีม (5–7 คน): **${CAMP.pricing.team.toLocaleString()}** บาท`,
    ].join('\n'),
  },
  {
    keys: ['สมัคร','apply','form','ลงทะเบียน','register'],
    answer: () => `📝 เดี่ยว: ${CAMP.forms.individual}\n👥 ทีม: ${CAMP.forms.team}`,
  },
  {
    keys: ['ติดต่อ','contact','line','facebook'],
    answer: () => `💬 LINE OA: ${CAMP.forms.line}\nFacebook: ${CAMP.forms.facebook}`,
  },
  {
    // วันที่จัด / เมื่อไหร่ / วันไหน / วันเวลา
    keys: ['วันที่จัด','เมื่อไหร่','วันไหน','วันเวลา','ตาราง','กำหนดการ','schedule','launch','workshop','date','when'],
    answer: () => `📆 กำหนดการ: ${SCHEDULE_SUMMARY}`,
  },
  {
    // จัดกี่วัน / กี่วัน
    keys: ['กี่วัน','จัดกี่วัน','อยู่กี่วัน','กี่วันทั้งหมด','how many days'],
    answer: () => '⏱️ ระยะเวลา: Workshop 3 วัน (1–3 ต.ค.) + Launch 5 วัน (6–10 ต.ค.) รวม **8 วัน**',
  },
  {
    keys: ['สถานที่','ที่ไหน','แผนที่','map','venue','where'],
    answer: () => VENUES.map(v => `• ${v.name}: ${v.url}`).join('\n'),
  },
];

function findKBAnswer(q) {
  const t = (q || '').toLowerCase();
  for (const item of KB) {
    if (item.keys.some(k => t.includes(k.toLowerCase()))) return item.answer();
  }
  return null;
}

// —— คำตอบกรณีไม่เกี่ยวกับค่าย
const NOT_CAMP_REPLY = 'ขอบคุณครับ/ค่ะ ข้อความนี้ดูเหมือนไม่เกี่ยวกับ **AC x KMUTT Rocket Camp 2025** จึงไม่มีข้อมูล 🙏\nต้องการข้อมูลค่าย ลองพิมพ์: `ราคา`, `สมัคร`, `ตาราง`, `สถานที่` หรือใช้คำสั่ง `!help`.';

// ===== Embeds สำหรับคำสั่ง ! =====
function makeOverviewEmbed() {
  return new EmbedBuilder()
    .setTitle('🚀 AC x KMUTT Rocket Camp 2025 — Operated by DTI')
    .setDescription(CAMP.desc)
    .addFields(
      { name: 'สถานที่/เวลา', value: `• ${CAMP.where1}\n• ${CAMP.where2}` },
      { name: 'ค่าสมัคร', value: `Spectator: ${CAMP.pricing.spectator} บาท\nเดี่ยว: ${CAMP.pricing.individual} บาท\nทีม: ${CAMP.pricing.team} บาท` },
      { name: 'ลิงก์สมัคร', value: `เดี่ยว: ${CAMP.forms.individual}\nทีม: ${CAMP.forms.team}` },
      { name: 'กำหนดการย่อ', value: SCHEDULE_SUMMARY }
    )
    .setFooter({ text: 'สอบถาม: LINE OA @spaceac | Facebook: go.spaceac.tech/facebook' });
}

function makeVenueEmbed() {
  return new EmbedBuilder().setTitle('🗺️ สถานที่ / Venues')
    .setDescription(VENUES.map(v => `• [${v.name}](${v.url})`).join('\n'));
}

// ===== Utils =====
function truncate(str, limit) {
  if (!str) return '';
  return str.length <= limit ? str : str.slice(0, limit - 12) + '\n...[truncated]';
}

function buildGeminiContext(question) {
  const parts = [
    'You are the info bot for "AC x KMUTT Rocket Camp 2025 — Operated by DTI".',
    'Answer in Thai, concise; use short bullets where helpful.',
    `Overview:\n${CAMP.desc}`,
    `Schedule (short): ${SCHEDULE_SUMMARY}`,
    `Apply: individual ${CAMP.forms.individual} | team ${CAMP.forms.team}`,
    `Pricing: spectator ${CAMP.pricing.spectator} THB, individual ${CAMP.pricing.individual} THB, team ${CAMP.pricing.team} THB`,
    `Venues: ${VENUES[0].name} | ${VENUES[1].name} | ${VENUES[2].name}`,
    `Question: ${question}`,
  ].join('\n');
  return truncate(parts, GEMINI_MAX_INPUT_CHARS);
}

function isCampRelated(text) {
  const t = (text || '').toLowerCase();
  const keywords = [
    'rocket','จรวด','ค่าย','สมัคร','ลงทะเบียน','ราคา','ค่าสมัคร','กำหนดการ','ตาราง',
    'วันที่จัด','เมื่อไหร่','วันไหน','สถานที่','แผนที่','วังจันทร์','kmutt','dti','space ac',
    'camp','workshop','launch','assumption','dream maker'
  ];
  return keywords.some(k => t.includes(k));
}

// ===== Gemini (ประหยัดโควต้า) =====
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error('Gemini not configured');

  if (GEMINI_PROVIDER === 'google') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        topP: 0.9,
        topK: 40
      }
    };

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}: ${await resp.text().catch(()=>'<no body>')}`);
    const json = await resp.json();
    const parts = json.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text).filter(Boolean).join('\n').trim();
    return text || 'ไม่มีข้อมูล';
  }

  if (!GENERIC_ENDPOINT) throw new Error('Generic endpoint not set');
  const resp = await fetch(GENERIC_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, max_tokens: GEMINI_MAX_OUTPUT_TOKENS, temperature: 0.2 }),
  });
  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}: ${await resp.text().catch(()=>'<no body>')}`);
  const json = await resp.json();
  return json.text || json.output || JSON.stringify(json);
}

// ===== Rate limit =====
const perUserCooldown = new Map();   // `${channelId}:${userId}` -> ts
const perChannelBuckets = new Map(); // channelId -> { count, windowStartMs }

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

// ===== Gates =====
function channelAllowed(channel) {
  if (!AUTO_REPLY) return false;
  if (!ALLOWED_CHANNELS.length) return true;
  return ALLOWED_CHANNELS.includes(channel.id);
}

// ===== Commands + Auto =====
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    // allow text & thread-like surfaces
    const textlike = new Set([
      ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread,
      ChannelType.AnnouncementThread, ChannelType.GuildAnnouncement, ChannelType.GuildForum
    ]);
    if (!textlike.has(message.channel?.type)) return;

    const content = message.content || '';

    // ---------- Commands (with !) ----------
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
            `• \`${PREFIX}ask <คำถาม>\` — ถาม AI (โหมดประหยัดโควต้า Gemini)`,
          ].join('\n')
        );
      }

      if (cmd === 'rocketcamp') return message.channel.send({ embeds: [makeOverviewEmbed()] });
      if (cmd === 'price') {
        return message.reply(
          `💰 ค่าสมัคร:\n- Spectator: ${CAMP.pricing.spectator} บาท\n- เดี่ยว: ${CAMP.pricing.individual} บาท\n- ทีม (5–7 คน): ${CAMP.pricing.team} บาท\n📆 ${SCHEDULE_SUMMARY}`
        );
      }
      if (cmd === 'apply') return message.reply(`📝 สมัคร: เดี่ยว ${CAMP.forms.individual} | ทีม ${CAMP.forms.team}`);
      if (cmd === 'contact') return message.reply(`💬 LINE: ${CAMP.forms.line}\nFacebook: ${CAMP.forms.facebook}`);
      if (cmd === 'venue') return message.channel.send({ embeds: [makeVenueEmbed()] });

      if (cmd === 'ask') {
        const q = args.join(' ');
        if (!q) return message.reply(`ใช้: \`${PREFIX}ask <คำถาม>\``);

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

      return; // unknown command – เงียบ
    }

    // ---------- Auto-reply (no !) ----------
    if (!channelAllowed(message.channel)) { dlog('skip: channel not allowed'); return; }
    if (!canReply(message.channel.id, message.author.id)) { dlog('skip: rate limit'); return; }

    // โหมด all: ตอบทุกข้อความ / โหมดอื่นใช้ข้อความไม่ว่าง
    if (AUTO_MODE !== 'all' && !content.trim()) { dlog('skip: empty'); return; }

    await message.channel.sendTyping();

    // 1) ถ้าไม่เกี่ยวกับค่าย → ตอบข้อความมาตรฐาน
    if (!isCampRelated(content)) {
      return message.reply(NOT_CAMP_REPLY);
    }

    // 2) KB ก่อน (ฟรี)
    const kbAns = findKBAnswer(content);
    if (kbAns) return message.reply(truncate(kbAns, 1900));

    // 3) Gemini (มีคีย์เท่านั้น)
    if (GEMINI_API_KEY) {
      try {
        const ctx = buildGeminiContext(content);
        const llm = await callGemini(ctx);
        return message.reply(truncate(llm, 1900));
      } catch (e) {
        console.error('Gemini error:', e);
      }
    }

    // 4) ไม่มีข้อมูลเฉพาะ
    return message.reply('ขออภัย ไม่มีข้อมูลเฉพาะสำหรับคำถามนี้ครับ/ค่ะ 🙏 ลองพิมพ์: `ราคา`, `สมัคร`, `ตาราง`, `สถานที่` หรือ `!help`');

  } catch (err) {
    console.error('Handler error:', err);
  }
});

// ===== START =====
client.login(TOKEN);
