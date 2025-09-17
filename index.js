// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require('discord.js');
const fetch = global.fetch ?? require('node-fetch');

// ===== ENV =====
const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || '!';
const AUTO_REPLY = (process.env.AUTO_REPLY || 'off').toLowerCase() === 'on';
const ALLOWED_CHANNELS = (process.env.AUTO_REPLY_CHANNELS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const COOLDOWN_S = Number(process.env.AUTO_REPLY_COOLDOWN_SECONDS || 15);
const MAX_PER_MIN = Number(process.env.AUTO_REPLY_MAX_PER_MIN || 12);
const USE_THREADS = (process.env.AUTO_REPLY_USE_THREADS || 'off').toLowerCase() === 'on';

const GEMINI_PROVIDER = (process.env.GEMINI_PROVIDER || 'google').toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GENERIC_ENDPOINT = process.env.GEMINI_ENDPOINT || '';

if (!TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

// ===== DISCORD CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🤖 Auto-reply: ${AUTO_REPLY ? 'ON' : 'OFF'}`);
  console.log(`📺 Allowed channels: ${ALLOWED_CHANNELS.length ? ALLOWED_CHANNELS.join(', ') : 'ALL'}`);
});

// ===== ROCKET CAMP DATA (edit as needed) =====
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

const SCHEDULE = {
  workshop: [
    { date: '1/10/2568', items: ['07:30 ลงทะเบียน', '08:00–12:00 Fundamental of Rocket (DTI)', '13:00–16:00 ร่มชูชีพ / 3D / OpenRocket', '16:00 ปิดฐาน'] },
    { date: '2/10/2568', items: ['07:30 ลงทะเบียน', '08:00–12:00 ครีบ/วงจร/โค้ดควบคุม', '13:00–16:00 ภายในจรวด (KMUTT) / วงจร / โค้ด', '16:00 ปิดฐาน'] },
    { date: '3/10/2568', items: ['07:30 ลงทะเบียน', '08:00–12:00 Deployment (KMUTT) / ขับเคลื่อน&วัตถุระเบิด (DTI)', '13:00–15:00 ความปลอดภัย', '15:00 ปิดฐาน'] },
  ],
  launch: [
    { date: '6/10/2568', items: ['เดินทางไปวังจันทร์ฯ', 'เปิดค่าย/ชี้แจง', 'นำเสนอแบบ & ติดตั้ง Deploy'] },
    { date: '7/10/2568', items: ['ทดสอบ Deploy', 'ประกอบ/ตรวจจรวด', 'สันทนาการ'] },
    { date: '8/10/2568', items: ['ทดสอบภาคพลวัต & เก็บกู้ ทั้งวัน'] },
    { date: '9/10/2568', items: ['ทดสอบภาคพลวัต (ต่อ)', 'After Party'] },
    { date: '10/10/2568', items: ['สำรองทดสอบ / พิธีปิด / เดินทางกลับ'] },
  ],
};

// ===== Knowledge Base =====
const KB = [
  {
    keys: ['ค่ายคืออะไร', 'เกี่ยวกับค่าย', 'about', 'rocketcamp', 'rocket camp'],
    answer: () => [
      'ℹ️ **เกี่ยวกับค่าย AC x KMUTT Rocket Camp 2025 (Operated by DTI)**',
      CAMP.desc,
      `📍 ${CAMP.where1}`,
      `📍 ${CAMP.where2}`,
      '📝 สมัครเดี่ยว/ทีม:\n' +
      `• เดี่ยว: ${CAMP.forms.individual}\n` +
      `• ทีม: ${CAMP.forms.team}`,
    ].join('\n'),
  },
  {
    keys: ['ราคา', 'ค่าสมัคร', 'price', 'pricing', 'spectator'],
    answer: () =>
      [
        '💰 **ค่าสมัคร / Pricing**',
        `• Spectator: **${CAMP.pricing.spectator.toLocaleString()}** บาท`,
        `• สมัครเดี่ยว: **${CAMP.pricing.individual.toLocaleString()}** บาท`,
        `• สมัครทีม (5–7 คน): **${CAMP.pricing.team.toLocaleString()}** บาท`,
      ].join('\n'),
  },
  {
    keys: ['สมัคร', 'apply', 'form', 'ลงทะเบียน', 'register', 'registration'],
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
    keys: ['ตาราง', 'กำหนดการ', 'schedule', 'workshop', 'launch', 'วันไหน'],
    answer: () =>
      [
        '📆 **กำหนดการ (ย่อ)**',
        '— Workshop 1–3 ต.ค. 2568:',
        ...SCHEDULE.workshop.map(d => `• ${d.date}: ${d.items.join(' | ')}`),
        '— Launch 6–10 ต.ค. 2568:',
        ...SCHEDULE.launch.map(d => `• ${d.date}: ${d.items.join(' | ')}`),
        `พิมพ์ \`${PREFIX}schedule workshop\` หรือ \`${PREFIX}schedule launch\` เพื่อดูละเอียด`,
      ].join('\n'),
  },
];

function findKBAnswer(q) {
  const t = (q || '').toLowerCase();
  for (const item of KB) {
    if (item.keys.some(k => t.includes(k.toLowerCase()))) return item.answer();
  }
  return null;
}

// ===== Embeds (for commands) =====
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

function makeScheduleEmbed(kind) {
  const data = kind === 'launch' ? SCHEDULE.launch : SCHEDULE.workshop;
  const title = kind === 'launch' ? '📆 Launch Week (6–10 ต.ค. 2568)' : '📆 Workshop Week (1–3 ต.ค. 2568)';
  const embed = new EmbedBuilder().setTitle(title);
  data.forEach(day => embed.addFields({ name: `• ${day.date}`, value: day.items.map(x => `- ${x}`).join('\n') }));
  return embed;
}

function makeVenueEmbed() {
  return new EmbedBuilder()
    .setTitle('🗺️ สถานที่ / Venues')
    .setDescription(VENUES.map(v => `• [${v.name}](${v.url})`).join('\n'));
}

// ===== Gemini (optional) =====
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error('Gemini not configured');

  if (GEMINI_PROVIDER === 'google') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const body = { contents: [{ parts: [{ text: prompt }] }] };
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

  if (!GENERIC_ENDPOINT) throw new Error('Generic endpoint not set');
  const resp = await fetch(GENERIC_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}: ${await resp.text().catch(() => '<no body>')}`);
  const json = await resp.json();
  if (typeof json.text === 'string') return json.text;
  if (typeof json.output === 'string') return json.output;
  if (Array.isArray(json.outputs) && json.outputs[0]?.text) return json.outputs[0].text;
  return JSON.stringify(json, null, 2);
}

// ===== Rate limiting =====
const perUserCooldown = new Map();           // key: `${channelId}:${userId}` -> timestamp
const perChannelBuckets = new Map();         // key: channelId -> { count, windowStartMs }

function canReply(channelId, userId) {
  const now = Date.now();
  const key = `${channelId}:${userId}`;
  const last = perUserCooldown.get(key) || 0;
  if (now - last < COOLDOWN_S * 1000) return false;

  let bucket = perChannelBuckets.get(channelId);
  if (!bucket || now - bucket.windowStartMs > 60_000) {
    bucket = { count: 0, windowStartMs: now };
  }
  if (bucket.count >= MAX_PER_MIN) return false;

  perUserCooldown.set(key, now);
  bucket.count += 1;
  perChannelBuckets.set(channelId, bucket);
  return true;
}

// ===== Auto-reply gate =====
function allowedChannel(channel) {
  if (!AUTO_REPLY) return false;
  if (!ALLOWED_CHANNELS.length) return true;
  return ALLOWED_CHANNELS.includes(channel.id);
}

function looksLikeAQuestion(text) {
  const t = (text || '').trim().toLowerCase();
  return /[?？]$/.test(t) ||
         /(ราคา|ค่าสมัคร|สมัคร|ตาราง|กำหนดการ|ที่ไหน|วังจันทร์|kmutt|dti|space\s?ac|rocket|จรวด|camp|register|price|where|when|how)/i.test(t);
}

// ===== Message handler (commands + auto) =====
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    const content = message.content || '';

    // ----- Commands (prefix) -----
    if (content.startsWith(PREFIX)) {
      const args = content.slice(PREFIX.length).trim().split(/\s+/);
      const cmd = (args.shift() || '').toLowerCase();

      if (cmd === 'help') {
        return message.reply(
          [
            'คำสั่ง:',
            `• \`${PREFIX}rocketcamp\` — ภาพรวมค่าย`,
            `• \`${PREFIX}schedule workshop|launch\` — ตารางกิจกรรม`,
            `• \`${PREFIX}price\` — ค่าสมัคร`,
            `• \`${PREFIX}apply\` — สมัคร`,
            `• \`${PREFIX}contact\` — ติดต่อ`,
            `• \`${PREFIX}venue\` — สถานที่/แผนที่`,
            `• \`${PREFIX}ask <คำถาม>\` — ถาม AI (ต้องตั้งค่า Gemini)`,
          ].join('\n')
        );
      }

      if (cmd === 'rocketcamp') return message.channel.send({ embeds: [makeOverviewEmbed()] });
      if (cmd === 'schedule') {
        const sub = (args[0] || '').toLowerCase();
        if (!['workshop', 'launch'].includes(sub)) {
          return message.reply(`ใช้: \`${PREFIX}schedule workshop\` หรือ \`${PREFIX}schedule launch\``);
        }
        return message.channel.send({ embeds: [makeScheduleEmbed(sub)] });
      }
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

        // KB first
        const kb = findKBAnswer(q);
        if (kb) return message.reply(kb.length > 1900 ? kb.slice(0, 1900) + '\n...[truncated]' : kb);

        if (!GEMINI_API_KEY) return message.reply('❌ ยังไม่ตั้งค่า Gemini ใน .env');
        await message.channel.sendTyping();
        try {
          const context = [
            'Answer in Thai about AC x KMUTT Rocket Camp 2025.',
            CAMP.desc,
            `สถานที่: ${CAMP.where1} | ${CAMP.where2}`,
            `ค่าสมัคร: spectator ${CAMP.pricing.spectator} THB, individual ${CAMP.pricing.individual} THB, team ${CAMP.pricing.team} THB`,
            `ลิงก์สมัคร: ${CAMP.forms.individual} | ${CAMP.forms.team}`,
            `คำถาม: ${q}`
          ].join('\n');
          const ans = await callGemini(context);
          return message.reply(ans.slice(0, 1900));
        } catch (e) {
          console.error('Gemini error:', e);
          return message.reply('⚠️ เรียก Gemini ไม่สำเร็จ');
        }
      }

      // unknown command ignored
      return;
    }

    // ----- Auto-reply (no prefix) -----
    if (!allowedChannel(message.channel)) return;
    if (!looksLikeAQuestion(content)) return;
    if (!canReply(message.channel.id, message.author.id)) return;

    await message.channel.sendTyping();

    // KB first
    const kbAns = findKBAnswer(content);
    let replyText = kbAns;
    if (!replyText && GEMINI_API_KEY) {
      const context = [
        'Answer in Thai about AC x KMUTT Rocket Camp 2025.',
        CAMP.desc,
        `สถานที่: ${CAMP.where1} | ${CAMP.where2}`,
        `ค่าสมัคร: spectator ${CAMP.pricing.spectator} THB, individual ${CAMP.pricing.individual} THB, team ${CAMP.pricing.team} THB`,
        `ลิงก์สมัคร: ${CAMP.forms.individual} | ${CAMP.forms.team}`,
        `คำถามผู้ใช้: ${content}`
      ].join('\n');
      try {
        replyText = await callGemini(context);
      } catch (e) {
        console.error('Gemini error:', e);
      }
    }
    if (!replyText) {
      replyText = `ขอบคุณสำหรับคำถาม 🙌 ลองใช้คำสั่ง: \`${PREFIX}rocketcamp\`, \`${PREFIX}schedule workshop|launch\`, \`${PREFIX}price\`, \`${PREFIX}apply\``;
    }

    const safe = replyText.length > 1900 ? replyText.slice(0, 1900) + '\n...[truncated]' : replyText;

    if (USE_THREADS && message.channel.type === ChannelType.GuildText) {
      const threadName = `Q&A: ${message.author.username}`.slice(0, 80);
      const thread = await message.startThread({ name: threadName, autoArchiveDuration: 60 }).catch(() => null);
      if (thread) return thread.send(safe);
    }
    return message.reply(safe);
  } catch (err) {
    console.error('Handler error:', err);
  }
});

// ===== START =====
client.login(TOKEN);
