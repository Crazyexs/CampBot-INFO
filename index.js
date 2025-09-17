// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require('discord.js');
const fetch = global.fetch ?? require('node-fetch');

// ====== ENV ======
const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || '!';
const GEMINI_PROVIDER = (process.env.GEMINI_PROVIDER || 'google').toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GENERIC_ENDPOINT = process.env.GEMINI_ENDPOINT || '';

const AUTO_REPLY = (process.env.AUTO_REPLY || 'off').toLowerCase() === 'on';
const ALLOWED_CHANNELS = (process.env.AUTO_REPLY_CHANNELS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const COOLDOWN_S = Number(process.env.AUTO_REPLY_COOLDOWN_SECONDS || 15);
const MAX_PER_MIN = Number(process.env.AUTO_REPLY_MAX_PER_MIN || 12);
const USE_THREADS = (process.env.AUTO_REPLY_USE_THREADS || 'off').toLowerCase() === 'on';

if (!TOKEN) {
  console.error('ERROR: DISCORD_TOKEN not set in .env');
  process.exit(1);
}

// ====== DISCORD CLIENT ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Auto-reply: ${AUTO_REPLY ? 'ON' : 'OFF'}`);
  if (ALLOWED_CHANNELS.length) {
    console.log(`📺 Allowed channels: ${ALLOWED_CHANNELS.join(', ')}`);
  } else {
    console.log('📺 Allowed channels: ALL (no filter)');
  }
});

// ====== ROCKET CAMP DATA (same as before, trimmed here for brevity) ======
const CAMP_OVERVIEW = {
  title: 'AC x KMUTT Rocket Camp 2025 — Operated by DTI',
  desc: [
    'ค่ายพัฒนาด้านวิศวกรรมศาสตร์ ชวนสัมผัสโปรเจคอวกาศจนกลายเป็นวิศวกรตัวจริง!',
    'ปีนี้ร่วมมือ: SPACE AC Institute of Technology × คณะวิศวกรรมศาสตร์ มจธ. × DTI × PTT',
    'ภารกิจ: ออกแบบ/สร้าง/ทดสอบ Sounding Rocket ขนาด 5 นิ้ว ยาว ~1.5 ม. ยิงสูง ~1 กม.',
    'เหมาะกับ: นร. ม.ปลาย สนใจวิศวกรรม/อวกาศ',
  ].join('\n'),
  where1: 'ศูนย์การเรียนรู้ฯ @ โรงเรียนอัสสัมชัญ (Workshop 1–3 ต.ค. 2025)',
  where2: 'วังจันทร์วัลเลย์ จ.ระยอง (6–10 ต.ค. 2025)',
  perks: [
    'Top 3 ได้สิทธิ์สัมภาษณ์เข้าศึกษาต่อ คณะวิศวกรรมศาสตร์ มจธ.',
    'Study visit หน่วยงานในวังจันทร์วัลเลย์ (T-CAV, Smart Greenhouse โดย สวทช.)',
    'เวิร์กช็อปพื้นฐาน: CAD, 3D Printing, วงจร, Coding',
    'ทดสอบจริงภายใต้มาตรฐาน ESRA/NASA',
    'สอนโดย DTI, อาจารย์ มจธ., นักวิจัย/วิศวกร PTT',
  ],
  forms: {
    individual: 'https://go.spaceac.tech/rocket-camp-2025-form',
    team: 'https://go.spaceac.tech/rocket-camp-2025-team',
    line: 'https://lin.ee/W4dKV7D',
    facebook: 'https://go.spaceac.tech/facebook',
  },
  pricing: {
    spectator: 2000,
    individual: 12345,
    team: 100000,
    teamNotes: [
      '(Option A) ส่วนลดค่ายปีถัดไป 20%',
      '(Option B) ส่วนลดกิจกรรมศูนย์ DREAM Maker Space 50%',
      'สิทธิ์ 3D Printing 77 ชั่วโมง',
    ],
    earlyNotes: [
      'Early Bird / Early Flock เต็มแล้ว',
      'เดี่ยว: 3D Printing ฟรี 15 ชั่วโมง (5 สิทธิ์แรก — เต็ม)',
      'ทีม: 3D Printing ฟรี 140 ชั่วโมง (ทีมแรก — เต็ม)',
    ],
  },
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

// ====== Simple KB (Thai-first)
const KB = [
  {
    keys: ['ค่ายคืออะไร', 'เกี่ยวกับค่าย', 'about', 'rocketcamp', 'rocket camp', 'rocketcamp'],
    answer: () =>
      [
        'ℹ **เกี่ยวกับค่าย AC x KMUTT Rocket Camp 2025 (Operated by DTI)**',
        CAMP_OVERVIEW.desc,
        ` ${CAMP_OVERVIEW.where1}`,
        ` ${CAMP_OVERVIEW.where2}`,
        'ไฮไลต์:',
        ...CAMP_OVERVIEW.perks.map(p => `• ${p}`),
      ].join('\n'),
  },
  {
    keys: ['ราคา', 'ค่าสมัคร', 'price', 'pricing', 'spectator'],
    answer: () =>
      [
        ' **ค่าสมัคร / Pricing**',
        `• Spectator: **${CAMP_OVERVIEW.pricing.spectator.toLocaleString()}** บาท`,
        `• สมัครเดี่ยว: **${CAMP_OVERVIEW.pricing.individual.toLocaleString()}** บาท`,
        `• สมัครทีม (5–7 คน): **${CAMP_OVERVIEW.pricing.team.toLocaleString()}** บาท`,
        'ตัวเลือกทีม:',
        ...CAMP_OVERVIEW.pricing.teamNotes.map(t => `- ${t}`),
        'หมายเหตุ:',
        ...CAMP_OVERVIEW.pricing.earlyNotes.map(t => `- ${t}`),
      ].join('\n'),
  },
  {
    keys: ['สมัคร', 'apply', 'form', 'ลงทะเบียน', 'register', 'registration'],
    answer: () =>
      [
        '**ลิงก์สมัคร**',
        `เดี่ยว: ${CAMP_OVERVIEW.forms.individual}`,
        `ทีม: ${CAMP_OVERVIEW.forms.team}`,
      ].join('\n'),
  },
  {
    keys: ['ติดต่อ', 'contact', 'line', 'facebook'],
    answer: () =>
      [
        ' **ติดต่อสอบถาม**',
        `LINE OA: ${CAMP_OVERVIEW.forms.line}`,
        `Facebook: ${CAMP_OVERVIEW.forms.facebook}`,
      ].join('\n'),
  },
  {
    keys: ['แผนที่', 'สถานที่', 'ที่ไหน', 'where', 'venue', 'map'],
    answer: () => VENUES.map(v => `• ${v.name}: ${v.url}`).join('\n'),
  },
  {
    keys: ['ตาราง', 'กำหนดการ', 'schedule', 'workshop', 'launch', 'วันไหน'],
    answer: () =>
      [
        ' **กำหนดการ (สรุป)**',
        '— Workshop (1–3 ต.ค. 2568):',
        ...SCHEDULE.workshop.map(d => `• ${d.date}: ${d.items.join(' | ')}`),
        '— Launch (6–10 ต.ค. 2568):',
        ...SCHEDULE.launch.map(d => `• ${d.date}: ${d.items.join(' | ')}`),
        `พิมพ์ \`${PREFIX}schedule workshop\` หรือ \`${PREFIX}schedule launch\` เพื่อดูละเอียด`,
      ].join('\n'),
  },
];

function findKBAnswer(q) {
  const t = q.toLowerCase();
  for (const item of KB) {
    if (item.keys.some(k => t.includes(k.toLowerCase()))) {
      return item.answer();
    }
  }
  return null;
}

// ====== Embeds for commands (kept for manual use)
function makeOverviewEmbed() {
  return new EmbedBuilder()
    .setTitle('AC x KMUTT Rocket Camp 2025 — Operated by DTI')
    .setDescription(CAMP_OVERVIEW.desc)
    .addFields(
      { name: 'สถานที่/ช่วงเวลา', value: `• ${CAMP_OVERVIEW.where1}\n• ${CAMP_OVERVIEW.where2}` },
      { name: 'สิทธิพิเศษ', value: CAMP_OVERVIEW.perks.map(p => `• ${p}`).join('\n') },
      {
        name: 'ค่าสมัคร',
        value:
          `• Spectator: **${CAMP_OVERVIEW.pricing.spectator.toLocaleString()}** บาท\n` +
          `• เดี่ยว: **${CAMP_OVERVIEW.pricing.individual.toLocaleString()}** บาท\n` +
          `• ทีม (5–7 คน): **${CAMP_OVERVIEW.pricing.team.toLocaleString()}** บาท`
      },
      { name: 'ลิงก์สมัคร', value: ` ${CAMP_OVERVIEW.forms.individual}\n${CAMP_OVERVIEW.forms.team}` },
    )
    .setFooter({ text: 'สอบถาม: LINE OA @spaceac | Facebook: go.spaceac.tech/facebook' });
}

function makeScheduleEmbed(kind) {
  const data = kind === 'launch' ? SCHEDULE.launch : SCHEDULE.workshop;
  const title = kind === 'launch' ? 'Launch Week (6–10 ต.ค. 2568)' : 'Workshop Week (1–3 ต.ค. 2568)';
  const embed = new EmbedBuilder().setTitle(title);
  data.forEach(day => embed.addFields({ name: `• ${day.date}`, value: day.items.map(x => `- ${x}`).join('\n') }));
  return embed;
}

function makePricingEmbed() {
  return new EmbedBuilder()
    .setTitle('ค่าสมัคร / Pricing')
    .addFields(
      { name: 'Spectator', value: `**${CAMP_OVERVIEW.pricing.spectator.toLocaleString()}** บาท`, inline: true },
      { name: 'เดี่ยว (1 คน)', value: `**${CAMP_OVERVIEW.pricing.individual.toLocaleString()}** บาท`, inline: true },
      { name: 'ทีม (5–7 คน)', value: `**${CAMP_OVERVIEW.pricing.team.toLocaleString()}** บาท`, inline: true },
    )
    .addFields(
      { name: 'ตัวเลือกทีม', value: CAMP_OVERVIEW.pricing.teamNotes.map(t => `- ${t}`).join('\n') },
      { name: 'หมายเหตุ Early', value: CAMP_OVERVIEW.pricing.earlyNotes.map(t => `- ${t}`).join('\n') },
    );
}

function makeVenueEmbed() {
  return new EmbedBuilder()
    .setTitle('🗺️ สถานที่จัดกิจกรรม / Venues')
    .setDescription(VENUES.map(v => `• [${v.name}](${v.url})`).join('\n'));
}

// ====== LLM CALLS ======
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
    const candidates = json.candidates || [];
    const parts = candidates[0]?.content?.parts || [];
    const text = parts.map(p => p.text).filter(Boolean).join('\n').trim();
    return text || 'No content returned from Gemini.';
  }

  if (!GENERIC_ENDPOINT) throw new Error('Generic endpoint not set');

  const resp = await fetch(GENERIC_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GEMINI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });
  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}: ${await resp.text().catch(() => '<no body>')}`);
  const json = await resp.json();
  if (typeof json.text === 'string') return json.text;
  if (typeof json.output === 'string') return json.output;
  if (Array.isArray(json.outputs) && json.outputs[0]?.text) return json.outputs[0].text;
  return JSON.stringify(json, null, 2);
}

// ====== RATE LIMITING ======
const perUserCooldown = new Map(); 
const perChannelBuckets = new Map(); 

function canReply(channelId, userId) {
  const now = Date.now();

  // per-user cooldown
  const key = `${channelId}:${userId}`;
  const last = perUserCooldown.get(key) || 0;
  if (now - last < COOLDOWN_S * 1000) return false;

  // per-channel token bucket 
  const b = perChannelBuckets.get(channelId) || { count: 0, windowStartMs: now };
  if (now - b.windowStartMs > 60_000) {
    b.count = 0;
    b.windowStartMs = now;
  }
  if (b.count >= MAX_PER_MIN) return false;

  // record tentative usage
  perUserCooldown.set(key, now);
  b.count += 1;
  perChannelBuckets.set(channelId, b);
  return true;
}

// ====== DECISION HEURISTICS ======
function looksLikeAQuestion(text) {
  const t = text.trim();
  if (!t) return false;
  // question marks or Thai interrogatives
  return /[?？]$/.test(t) ||
    /(คืออะไร|อย่างไร|ที่ไหน|เมื่อไหร่|ทำไม|ราคา|ค่าสมัคร|วิธีสมัคร|ตาราง|กำหนดการ|Where|When|How|Price|Cost)/i.test(t) ||
    /(rocket|จรวด|ค่าย|สมัคร|ราคา|วังจันทร์|KMUTT|DTI|PTT|SPACE\s?AC)/i.test(t);
}

function channelAllowed(channel) {
  if (!AUTO_REPLY) return false;
  if (!ALLOWED_CHANNELS.length) return true;
  return ALLOWED_CHANNELS.includes(channel.id);
}

// ====== MESSAGE HANDLER  ======
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel?.type !== ChannelType.GuildText && message.channel?.type !== ChannelType.PublicThread) return;

    const content = message.content || '';

    // ---------- 1) Manual commands with prefix ----------
    if (content.startsWith(PREFIX)) {
      const args = content.slice(PREFIX.length).trim().split(/\s+/);
      const cmd = (args.shift() || '').toLowerCase();

      if (cmd === 'help') {
        return message.reply(
          [
            'คำสั่งที่ใช้ได้:',
            `• \`${PREFIX}rocketcamp\` — ภาพรวมค่าย (TH)`,
            `• \`${PREFIX}schedule workshop|launch\` — ตารางกิจกรรม`,
            `• \`${PREFIX}price\` — ค่าสมัคร`,
            `• \`${PREFIX}apply\` — ลิงก์สมัคร`,
            `• \`${PREFIX}contact\` — ช่องทางติดต่อ`,
            `• \`${PREFIX}venue\` — สถานที่/แผนที่`,
            `• \`${PREFIX}ask <คำถาม>\` — ถาม AI (ใช้ Gemini ถ้าตั้งค่าแล้ว)`,
            `• \`${PREFIX}help\` — แสดงคำสั่ง`,
          ].join('\n')
        );
      }

      if (cmd === 'rocketcamp') return message.channel.send({ embeds: [makeOverviewEmbed()] });

      if (cmd === 'schedule') {
        const sub = (args[0] || '').toLowerCase();
        if (!sub || !['workshop', 'launch'].includes(sub)) {
          return message.reply(`ใช้: \`${PREFIX}schedule workshop\` หรือ \`${PREFIX}schedule launch\``);
        }
        return message.channel.send({ embeds: [makeScheduleEmbed(sub)] });
      }

      if (cmd === 'price') return message.channel.send({ embeds: [makePricingEmbed()] });

      if (cmd === 'apply') {
        return message.reply(` ลิงก์สมัคร:\n เดี่ยว: ${CAMP_OVERVIEW.forms.individual}\n ทีม: ${CAMP_OVERVIEW.forms.team}`);
      }

      if (cmd === 'contact') {
        return message.reply(` ติดต่อ: LINE OA ${CAMP_OVERVIEW.forms.line}\nFacebook: ${CAMP_OVERVIEW.forms.facebook}`);
      }

      if (cmd === 'venue') return message.channel.send({ embeds: [makeVenueEmbed()] });

      if (cmd === 'ask') {
        const q = args.join(' ');
        if (!q) return message.reply(`พิมพ์: \`${PREFIX}ask <คำถาม>\``);

        await message.channel.sendTyping();

        const kbAns = findKBAnswer(q);
        if (kbAns) return message.reply(kbAns.length > 1900 ? kbAns.slice(0, 1900) + '\n...[truncated]' : kbAns);

        if (GEMINI_API_KEY) {
          const context = [
            'You are the information bot for "AC x KMUTT Rocket Camp 2025 — Operated by DTI" (Thai).',
            'Answer in Thai. Be concise and accurate.',
            CAMP_OVERVIEW.desc,
            VENUES.map(v => `- ${v.name}: ${v.url}`).join('\n'),
            `Prices: spectator ${CAMP_OVERVIEW.pricing.spectator} THB, individual ${CAMP_OVERVIEW.pricing.individual} THB, team ${CAMP_OVERVIEW.pricing.team} THB`,
            `Forms: ${CAMP_OVERVIEW.forms.individual} | ${CAMP_OVERVIEW.forms.team}`,
            'Workshop:',
            SCHEDULE.workshop.map(d => `${d.date}: ${d.items.join(' | ')}`).join('\n'),
            'Launch:',
            SCHEDULE.launch.map(d => `${d.date}: ${d.items.join(' | ')}`).join('\n'),
            `Question: ${q}`,
          ].join('\n');

          try {
            const llmReply = await callGemini(context);
            const safe = llmReply.length > 1900 ? llmReply.slice(0, 1900) + '\n...[truncated]' : llmReply;
            return message.reply(safe);
          } catch (e) { return message.reply('ไม่สามารถเรียกใช้ AI ภายนอกได้ตอนนี้'); }
        }

        return message.reply('ตอนนี้ตอบจาก AI ภายนอกไม่ได้ ลองใช้คำสั่ง: `!rocketcamp`, `!schedule`, `!price`, `!apply`');
      }

      return;
    }

    if (!channelAllowed(message.channel)) return;
    if (!looksLikeAQuestion(content)) return;
    if (!canReply(message.channel.id, message.author.id)) return;

    await message.channel.sendTyping();

    const kbAns = findKBAnswer(content);
    const replyText = kbAns ? kbAns : await (async () => {
      if (GEMINI_API_KEY) {
        const context = [
          'You are the information bot for "AC x KMUTT Rocket Camp 2025 — Operated by DTI" (Thai).',
          'Answer in Thai. Be concise and accurate.',
          CAMP_OVERVIEW.desc,
          `สถานที่: ${CAMP_OVERVIEW.where1} | ${CAMP_OVERVIEW.where2}`,
          `ค่าสมัคร: spectator ${CAMP_OVERVIEW.pricing.spectator} THB, individual ${CAMP_OVERVIEW.pricing.individual} THB, team ${CAMP_OVERVIEW.pricing.team} THB`,
          `ลิงก์สมัคร: ${CAMP_OVERVIEW.forms.individual} | ${CAMP_OVERVIEW.forms.team}`,
          'กำหนดการย่อ:',
          'Workshop: ' + SCHEDULE.workshop.map(d => `${d.date}: ${d.items.join(' | ')}`).join(' ; '),
          'Launch: ' + SCHEDULE.launch.map(d => `${d.date}: ${d.items.join(' | ')}`).join(' ; '),
          `คำถามผู้ใช้: ${content}`,
        ].join('\n');

        try {
          const llmReply = await callGemini(context);
          return llmReply || 'ไม่มีข้อมูลเพิ่มเติม';
        } catch {
        }
      }
      return 'ขอบคุณสำหรับคำถามครับ  ลองดูคำสั่ง: `!rocketcamp`, `!schedule`, `!price`, `!apply` เพื่อข้อมูลแบบสรุป';
    })();

    const safe = replyText.length > 1900 ? replyText.slice(0, 1900) + '\n...[truncated]' : replyText;

    if (USE_THREADS && message.channel.type === ChannelType.GuildText) {

      const threadName = `Q&A: ${message.author.username}`.slice(0, 80);
      const thread = await message.startThread({
        name: threadName,
        autoArchiveDuration: 60, 
      }).catch(() => null);

      if (thread) {
        return thread.send(safe);
      }
    }
    return message.reply(safe);
  } catch (err) {
    console.error('Handler error:', err);
  }
});

client.login(TOKEN);
