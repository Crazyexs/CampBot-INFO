"use strict";
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require("discord.js");
const fetch = global.fetch ?? require("node-fetch");

// 0) ENV & CONSTANTS (mutable for admin runtime updates)
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

let PREFIX = process.env.PREFIX || "!";
let AUTO_REPLY = (process.env.AUTO_REPLY || "off").toLowerCase() === "on";
let AUTO_MODE = (process.env.AUTO_REPLY_MODE || "all").toLowerCase(); // all | loose | strict
let ALLOWED_CHANNELS = (process.env.AUTO_REPLY_CHANNELS || "")
  .split(",").map(s => s.trim()).filter(Boolean);
let COOLDOWN_S = Number(process.env.AUTO_REPLY_COOLDOWN_SECONDS || 8);
let MAX_PER_MIN = Number(process.env.AUTO_REPLY_MAX_PER_MIN || 20);
let USE_THREADS = (process.env.AUTO_REPLY_USE_THREADS || "off").toLowerCase() === "on";
let DEBUG = (process.env.DEBUG || "off").toLowerCase() === "on";
const ADMIN_IDS = new Set((process.env.ADMIN_IDS || "")
  .split(",").map(s => s.trim()).filter(Boolean)); // e.g. ADMIN_IDS=123,456

// Gemini (optional)
const GEMINI_PROVIDER = (process.env.GEMINI_PROVIDER || "google").toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
let GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
let GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 256);
let GEMINI_MAX_INPUT_CHARS = Number(process.env.GEMINI_MAX_INPUT_CHARS || 3000);
const GENERIC_ENDPOINT = process.env.GEMINI_ENDPOINT || "";
let GEMINI_ENABLED = !!GEMINI_API_KEY; // runtime toggle

const DISCORD_MAX_MSG = 2000;
const SAFE_REPLY_LEN = 1900;
const EMBED_FIELD_MAX = 1024;

// 1) DISCORD CLIENT
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("ready", () => {
  log(`Logged in as ${client.user.tag}`);
  log(`Auto-reply: ${AUTO_REPLY ? "ON" : "OFF"} (${AUTO_MODE})`);
  log(`Allowed channels: ${ALLOWED_CHANNELS.length ? ALLOWED_CHANNELS.join(", ") : "ALL"}`);
});

function log(...args) { console.log("[BOT]", ...args); }
function dlog(...args) { if (DEBUG) console.log("[DBG]", ...args); }

// 2) CONFIG FILE (camp.config.json)
const CONFIG_PATH = path.resolve(process.cwd(), "camp.config.json");

const DEFAULT_CONFIG = {
  camp: {
    title: "AC x KMUTT Rocket Camp 2025 — Operated by DTI",
    desc: [
      "ค่ายพัฒนาด้านวิศวกรรมศาสตร์ ชวนสัมผัสโปรเจคอวกาศจนกลายเป็นวิศวกรตัวจริง!",
      "ร่วมมือ: SPACE AC × KMUTT × DTI × PTT",
      "ภารกิจ: ออกแบบ/สร้าง/ทดสอบ Sounding Rocket ขนาด 5 นิ้ว ยาว ~1.5 ม. ยิงสูง ~1 กม."
    ].join("\n"),
    where1: "Workshop 1–3 ต.ค. 2025 @ โรงเรียนอัสสัมชัญ",
    where2: "Launch 6–10 ต.ค. 2025 @ วังจันทร์วัลเลย์ จ.ระยอง",
    forms: {
      individual: "https://go.spaceac.tech/rocket-camp-2025-form",
      team: "https://go.spaceac.tech/rocket-camp-2025-team",
      line: "https://lin.ee/W4dKV7D",
      facebook: "https://go.spaceac.tech/facebook"
    },
    pricing: { spectator: 2000, individual: 12345, team: 100000 },
    scheduleSummary: "Workshop 1–3 ต.ค. 2568 (3 วัน) และ Launch 6–10 ต.ค. 2568 (5 วัน) รวม 8 วัน",
    schedule: { workshop: [], launch: [] },
    eligibility: [],
    perks: []
  },
  venues: [
    { name: "วังจันทร์วัลเลย์ ระยอง (Wangchan Valley)", url: "https://maps.app.goo.gl/rmx8v35oLzxpFVXx7" },
    { name: "The EnCony @Wangchan Valley (ที่พัก)", url: "https://maps.app.goo.gl/Kyy2FwxVzWXQaRvx9" },
    { name: "ศูนย์ DREAM Maker Space @โรงเรียนอัสสัมชัญ", url: "https://maps.app.goo.gl/YWmYkq8vHaWsAeyN9" }
  ]
};

let STATE = clone(DEFAULT_CONFIG);
loadConfigFromDisk();
fs.watchFile(CONFIG_PATH, { interval: 2000 }, () => {
  log("Detected change in camp.config.json; reloading...");
  loadConfigFromDisk();
});

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function deepMerge(target, src) {
  if (Array.isArray(src)) return src.slice();
  if (src && typeof src === "object") {
    const out = { ...(target || {}) };
    for (const k of Object.keys(src)) out[k] = deepMerge(target?.[k], src[k]);
    return out;
  }
  return src === undefined ? target : src;
}
function loadConfigFromDisk() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      STATE = deepMerge(DEFAULT_CONFIG, parsed);
      log("Loaded camp.config.json");
    } else {
      log("camp.config.json not found; using defaults.");
      STATE = clone(DEFAULT_CONFIG);
    }
  } catch (e) {
    console.error("Failed to load camp.config.json:", e.message);
    STATE = clone(DEFAULT_CONFIG);
  }
}
function saveConfigToDisk() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(STATE, null, 2), "utf-8");
    log("Saved camp.config.json");
  } catch (e) {
    console.error("Failed to save camp.config.json:", e.message);
  }
}

// getters
const CAMP = () => STATE.camp;
const VENUES = () => STATE.venues;

// 3) INTENT MATCHING 
const INTENT_SYNONYMS = {
  about: [
    "ค่ายคืออะไร","เกี่ยวกับค่าย","ภาพรวม","รายละเอียดค่าย","คืออะไร",
    "about","overview","info","information","รายละเอียด","ข้อมูล",
    "ค่ายนี้เกี่ยวกับอะไร","อยากทราบรายละเอียดของค่ายเพิ่มเติม","ค่ายนี้จัดขึ้นเพื่ออะไร",
    "วัตถุประสงค์ของค่ายคืออะไร","ในค่ายมีกิจกรรมอะไรบ้าง","จะได้เรียนรู้อะไรจากค่ายนี้บ้าง",
    "คอนเซ็ปต์ของค่ายปีนี้คืออะไร","ช่วยเล่าเกี่ยวกับค่ายให้ฟังหน่อย","มีเนื้อหาอะไรบ้าง",
    "กิจกรรมในค่าย","สอนเรื่องอะไร","รูปแบบค่ายเป็นแบบไหน","จัดทำไม",
    "theme","concept","objective","details","activities","content",
    "what is this camp about","tell me more about the camp","what will I learn",
    "what's the purpose","camp objectives","curriculum","ลักษณะค่าย"
  ],
  price: [
    "ราคา","ค่าสมัคร","ค่าใช้จ่าย","เท่าไร","เท่าไหร่","ค่าธรรมเนียม","ค่าค่าย","กี่บาท",
    "fee","fees","cost","pricing","how much","ชำระเงิน","จ่ายเงิน","ส่วนลด",
    "ค่าใช้จ่ายทั้งหมดเท่าไหร่","ราคานี้รวมอะไรบ้าง","มีค่าใช้จ่ายเพิ่มเติมอีกไหม",
    "ต้องจ่ายเงินตอนไหน","จ่ายเงินยังไง","มีส่วนลดไหม","ราคานี้รวมค่าที่พักกับค่าอาหารหรือยัง",
    "มีทุนให้ไหม","ฟรีไหม","ไม่เสียเงินใช่ไหม","โปรโมชั่น","early bird","ช่องทางการชำระเงิน",
    "แบ่งจ่ายได้ไหม","ผ่อนชำระ","รวมค่าเดินทางไหม",
    "payment","discount","scholarship","financial aid","included","what's included",
    "is it free","payment method","installment plan","hidden costs"
  ],
  apply: [
    "สมัคร","สมัครยังไง","ลงทะเบียน","ฟอร์ม","แบบฟอร์ม","สมัครที่ไหน","กรอกฟอร์ม","สมัครได้ที่ไหน",
    "apply","application","register","registration","form","ปิดรับสมัคร","วันสุดท้าย",
    "เปิดรับสมัครถึงเมื่อไหร่","ปิดรับสมัครวันไหน","ต้องใช้อะไรสมัครบ้าง","มีขั้นตอนการสมัครอย่างไร",
    "สมัครผ่านเว็บไหน","ขอลิงก์สมัครหน่อย","ประกาศผลเมื่อไหร่","มีกี่รอบ",
    "เอกสาร","ขั้นตอน","ลิงก์","ประกาศผล","รอบ","deadline","how to apply","selection",
    "announcement","หมดเขตรับสมัคร","วิธีการสมัคร","สมัครออนไลน์","เอกสารที่ใช้สมัคร",
    "application process","required documents","selection process","announcement date"
  ],
  contact: [
    "ติดต่อ","สอบถาม","แอดมิน","แอดมินค่าย","คอนแทค","line","ไลน์","facebook","เพจ","เพจเฟซ",
    "contact","admin","staff","support","ช่องทาง","เบอร์โทร","อีเมล","โซเชียล",
    "มีช่องทางติดต่ออื่นๆ อีกไหม","ขอเบอร์โทรศัพท์","มี IG หรือ Twitter ไหม",
    "ติดต่อพี่สตาฟฟ์ได้ทางไหน","สอบถามข้อมูลเพิ่มเติมได้ที่ไหน","มีคำถาม",
    "social media","organizer","พี่เลี้ยง","สตาฟฟ์","email","phone number","IG",
    "ผู้จัด","inbox","dm"
  ],
  venue: [
    "ที่ไหน","สถานที่","แผนที่","อยู่ที่","location","map","ที่พัก","โรงแรม",
    "วังจันทร์","wangchan","encony","assumption","dream maker","kmutt","dti","space ac",
    "เดินทาง","การเดินทาง","ตึก","คณะ","มหาวิทยาลัย","จังหวัด","ที่จัดงาน","หอพัก",
    "ค่ายจัดที่ไหน","เดินทางไปยังไง","จัดที่ตึกไหน คณะอะไร","มีที่จอดรถไหม",
    "ค่ายจัดที่จังหวัดอะไร","พักกันที่ไหน","นอนที่ไหน","ไปยังไง","มีรถรับส่งไหม",
    "address","directions","accommodation","dormitory","how to get there","transportation",
    "shuttle bus","venue"
  ],
  schedule: [
    "ตาราง","กำหนดการ","วันเวลา","วันที่จัด","เมื่อไหร่","เริ่มเมื่อไหร่","จบเมื่อไหร่","วันไหน",
    "schedule","date","dates","when","time","timeline","workshop","launch","วันแรกทําไร",
    "ตารางกิจกรรม","ไทม์ไลน์","agenda","itinerary","เริ่มกี่โมง","เลิกกี่โมง",
    "ค่ายเริ่มกี่โมง","วันแรกต้องไปถึงกี่โมง","กิจกรรมเสร็จประมาณกี่โมง",
    "ขอกำหนดการของแต่ละวันหน่อย","มีพักเบรคไหม","วันสุดท้ายกลับได้กี่โมง",
    "start time","end time","activities schedule","daily schedule","กิจกรรมแต่ละวัน"
  ],
  duration: [
    "กี่วัน","ใช้เวลากี่วัน","รวมกี่วัน","อยู่กี่วัน","ทั้งหมดกี่วัน",
    "how many days","duration","days","ค้างคืน","ไปกลับ","กี่คืน",
    "ค่ายจัดกี่วันกี่คืน","เป็นค่ายค้างคืนไหม","จำเป็นต้องอยู่ตลอดระยะเวลาค่ายไหม",
    "ค่ายไปกลับได้ไหม","ระยะเวลาค่าย",
    "overnight","length","how long","day camp","must I stay for the whole period"
  ],
  eligibility: [
    "คุณสมบัติ","รับใครบ้าง","รับเฉพาะ","เงื่อนไข","ข้อกำหนด","สุขภาพ","ม.ปลาย","อายุ","ผ่านเกณฑ์",
    "eligibility","requirements","ระดับชั้น","สายการเรียน","พื้นฐาน","เกณฑ์การคัดเลือก",
    "รับนักเรียนชั้นไหนบ้าง","ม.4 / ม.5 / ม.6 สมัครได้ไหม","เด็กซิ่วสมัครได้ไหม",
    "ต้องเรียนสายวิทย์-คณิตไหม","ไม่มีพื้นฐานสมัครได้หรือเปล่า","ต้องเตรียม portfolio ไหม",
    "เกณฑ์การคัดเลือกคืออะไร","รับกี่คน","จำกัดอายุไหม","ต้องมีผลงานไหม",
    "prerequisites","who can join","grade level","GPA","portfolio","background",
    "age limit","รับปวช./ปวส.ไหม","ปี1สมัครได้ไหม"
  ],
  perks: [
    "สิทธิพิเศษ","top 3","รางวัล","benefit","benefits","perks","สัมภาษณ์","ได้อะไร","สิทธิ์","ของแถม",
    "เกียรติบัตร","certificate","ของรางวัล","ของที่ระลึก","เสื้อค่าย","connection",
    "เข้าร่วมค่ายแล้วจะได้อะไรบ้าง","มีเกียรติบัตรให้ไหม","ใบประกาศเอาไปยื่นพอร์ตได้ไหม",
    "มีของรางวัลอะไรบ้างสำหรับผู้ชนะ","มีเสื้อค่ายให้ไหม","ทำไมถึงควรเข้าร่วมค่ายนี้",
    "ประสบการณ์","สิ่งที่ได้รับกลับไป","ได้เจอเพื่อน","คอนเนคชั่น",
    "portfolio","takeaway","souvenir","t-shirt","networking","prizes",
    "มีรอบสัมภาษณ์พิเศษไหม","fast track","มีผลต่อการเข้าศึกษาต่อไหม"
  ]
};

const CAMP_TOKENS = Array.from(new Set([
  ...Object.values(INTENT_SYNONYMS).flat(),
  "rocket","จรวด","ค่าย","camp","workshop","launch","kmutt","dti","space ac","assumption","dream maker"
]));

// 4) TEXT UTILS
const normalize = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
const trunc = (s, n = SAFE_REPLY_LEN) => !s ? "" : (s.length <= n ? s : s.slice(0, n - 12) + "\n...[truncated]");
const isCampRelated = (txt) => CAMP_TOKENS.some(k => normalize(txt).includes(k));
function scoreIntent(text) {
  const t = normalize(text);
  let best = { intent: null, score: 0 };
  for (const [intent, words] of Object.entries(INTENT_SYNONYMS)) {
    let score = 0;
    for (const w of words) if (t.includes(w)) score++;
    if (score > best.score) best = { intent, score };
  }
  return best;
}

// 5) ANSWERS 
function ansAbout() {
  const c = CAMP();
  return [
    `ℹ️ **เกี่ยวกับค่าย ${c.title}**`,
    c.desc,
    `📍 ${c.where1}`,
    `📍 ${c.where2}`,
    `📝 สมัคร: เดี่ยว ${c.forms.individual} | ทีม ${c.forms.team}`
  ].join("\n");
}
function ansPrice() {
  const p = CAMP().pricing;
  return [
    "💰 **ค่าสมัคร / Pricing**",
    `• Spectator: **${p.spectator.toLocaleString()}** บาท`,
    `• เดี่ยว: **${p.individual.toLocaleString()}** บาท`,
    `• ทีม (5–7 คน): **${p.team.toLocaleString()}** บาท`
  ].join("\n");
}
function ansApply() {
  const f = CAMP().forms;
  return `📝 สมัครได้ที่\n• เดี่ยว: ${f.individual}\n• ทีม: ${f.team}`;
}
function ansContact() {
  const f = CAMP().forms;
  return [
    "ติดต่อสอบถาม",
    f.line ? `• LINE OA: ${f.line}` : null,
    f.facebook ? `• Facebook: ${f.facebook}` : null
  ].filter(Boolean).join("\n");
}
function ansVenue() { return VENUES().map(v => `• ${v.name}: ${v.url}`).join("\n"); }
function ansSchedule() {
  const c = CAMP();
  return `📆 กำหนดการโดยสรุป: ${c.scheduleSummary}\nดูรายละเอียด: \`${PREFIX}schedule workshop\` หรือ \`${PREFIX}schedule launch\``;
}
function ansDuration() { return `⏱️ ระยะเวลาโดยสรุป: ${CAMP().scheduleSummary}`; }
function ansEligibility() {
  const e = CAMP().eligibility || [];
  return e.length ? `คุณสมบัติผู้สมัคร\n- ${e.join("\n- ")}` : "คุณสมบัติ: โปรดติดต่อทีมงาน";
}
function ansPerks() {
  const p = CAMP().perks || [];
  return p.length ? `สิทธิพิเศษ\n- ${p.join("\n- ")}` : "สิทธิพิเศษ: โปรดติดต่อทีมงาน";
}
function answerByIntent(intent) {
  switch (intent) {
    case "about": return ansAbout();
    case "price": return ansPrice();
    case "apply": return ansApply();
    case "contact": return ansContact();
    case "venue": return ansVenue();
    case "schedule": return ansSchedule();
    case "duration": return ansDuration();
    case "eligibility": return ansEligibility();
    case "perks": return ansPerks();
    default: return null;
  }
}

// 6) EMBEDS
function makeOverviewEmbed() {
  const c = CAMP();
  return new EmbedBuilder()
    .setTitle(`🚀 ${c.title}`)
    .setDescription(c.desc)
    .addFields(
      { name: "สถานที่/เวลา", value: `• ${c.where1}\n• ${c.where2}` },
      { name: "ค่าสมัคร", value: `Spectator: ${c.pricing.spectator} บาท\nเดี่ยว: ${c.pricing.individual} บาท\nทีม: ${c.pricing.team} บาท` },
      { name: "ลิงก์สมัคร", value: `เดี่ยว: ${c.forms.individual}\nทีม: ${c.forms.team}` },
      { name: "กำหนดการย่อ", value: c.scheduleSummary }
    )
    .setFooter({ text: "สอบถาม: ติดต่อ staff ในเซิร์ฟเวอร์ | LINE OA @spaceac | Facebook: go.spaceac.tech/facebook" });
}
function makeVenueEmbed() {
  return new EmbedBuilder().setTitle("🗺️ สถานที่ / Venues")
    .setDescription(VENUES().map(v => `• [${v.name}](${v.url})`).join("\n"));
}
function makeScheduleEmbed(kind) {
  const c = CAMP();
  const data = (c.schedule && c.schedule[kind]) || [];
  const title = kind === "launch" ? "📆 Launch Days (6–10 ต.ค. 2568)" : "📆 Workshop Days (1–3 ต.ค. 2568)";
  const embed = new EmbedBuilder().setTitle(title);
  data.forEach(day => {
    const name = `• ${day.label} / ${day.thaiDate || ""}`.trim();
    const value = (day.items || []).map(x => `- ${x}`).join("\n").slice(0, EMBED_FIELD_MAX);
    if (value) embed.addFields({ name, value });
  });
  return embed;
}

// 7) GEMINI 
function buildGeminiContext(question) {
  const c = CAMP();
  const venues = VENUES().map(v => v.name).join(" | ");
  const parts = [
    'You are the info bot for "AC x KMUTT Rocket Camp 2025 — Operated by DTI".',
    "Answer in Thai, concise; use short bullet points where helpful.",
    `Overview:\n${c.desc}`,
    `Schedule (short): ${c.scheduleSummary}`,
    `Apply: individual ${c.forms.individual} | team ${c.forms.team}`,
    `Pricing: spectator ${c.pricing.spectator} THB, individual ${c.pricing.individual} THB, team ${c.pricing.team} THB`,
    `Venues: ${venues}`,
    `Question: ${question}`
  ].join("\n");
  return trunc(parts, GEMINI_MAX_INPUT_CHARS);
}
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error("Gemini not configured");

  if (GEMINI_PROVIDER === "google") {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent` +
      `?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        topP: 0.9,
        topK: 40
      }
    };
    const resp = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}: ${await resp.text().catch(() => "<no body>")}`);
    const json = await resp.json();
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text).filter(Boolean).join("\n").trim();
    return text || "ไม่มีข้อมูล";
  }

  if (!GENERIC_ENDPOINT) throw new Error("Generic endpoint not set");
  const resp = await fetch(GENERIC_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, max_tokens: GEMINI_MAX_OUTPUT_TOKENS, temperature: 0.2 })
  });
  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}: ${await resp.text().catch(() => "<no body>")}`);
  const json = await resp.json();
  return json.text || json.output || JSON.stringify(json);
}

// 8) RATE LIMITING & CHANNEL GATES
const perUserCooldown = new Map();   
const perChannelBuckets = new Map(); 

function canReply(channelId, userId) {
  const now = Date.now();

  const key = `${channelId}:${userId}`;
  const last = perUserCooldown.get(key) || 0;
  if (now - last < COOLDOWN_S * 1000) return false;

  let bucket = perChannelBuckets.get(channelId);
  if (!bucket || (now - bucket.windowStartMs > 60_000)) {
    bucket = { count: 0, windowStartMs: now };
  }
  if (bucket.count >= MAX_PER_MIN) return false;

  perUserCooldown.set(key, now);
  bucket.count += 1;
  perChannelBuckets.set(channelId, bucket);
  return true;
}
function channelAllowed(channel) {
  if (!AUTO_REPLY) return false;
  if (!ALLOWED_CHANNELS.length) return true;
  return ALLOWED_CHANNELS.includes(channel.id);
}

// 9) MESSAGES 
const getNotCampReply = () =>
  "ขอบคุณครับ/ค่ะ ข้อความนี้ดูไม่น่าจะเกี่ยวกับ AC x KMUTT Rocket Camp 2025 จึงไม่มีข้อมูลในระบบ\n" +
  `หากต้องการข้อมูลค่าย ลองพิมพ์: \`ราคา\`, \`สมัคร\`, \`ตาราง\`, \`สถานที่\` หรือใช้คำสั่ง \`${PREFIX}help\`.`;

const getHelpText = () => ([
  "คำสั่ง:",
  `• \`${PREFIX}rocketcamp\` — ภาพรวมค่าย`,
  `• \`${PREFIX}price\` — ค่าสมัคร`,
  `• \`${PREFIX}apply\` — สมัคร`,
  `• \`${PREFIX}contact\` — ติดต่อ`,
  `• \`${PREFIX}venue\` — สถานที่/แผนที่`,
  `• \`${PREFIX}schedule workshop|launch\` — ตารางกิจกรรมละเอียด`,
  `• \`${PREFIX}ask <คำถาม>\` — ถาม AI (โหมดประหยัดโควต้า Gemini)`,
  `• \`${PREFIX}admin help\` — คำสั่งผู้ดูแล (ตั้งค่า runtime)`
].join("\n"));

// 10) MESSAGE HANDLER 
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    const textlike = new Set([
      ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread,
      ChannelType.AnnouncementThread, ChannelType.GuildAnnouncement, ChannelType.GuildForum
    ]);
    if (!textlike.has(message.channel?.type)) return;

    const content = message.content || "";
    const tnorm = normalize(content);
    const userId = message.author.id;

    // ---------- Commands ----------
    if (content.startsWith(PREFIX)) {
      const args = content.slice(PREFIX.length).trim().split(/\s+/);
      const cmd = (args.shift() || "").toLowerCase();

      // Public commands
      if (cmd === "help") return message.reply(getHelpText());
      if (cmd === "rocketcamp") return message.channel.send({ embeds: [makeOverviewEmbed()] });
      if (cmd === "price") return message.reply(trunc(ansPrice() + `\n📆 ${CAMP().scheduleSummary}`));
      if (cmd === "apply") return message.reply(trunc(ansApply()));
      if (cmd === "contact") return message.reply(trunc(ansContact()));
      if (cmd === "venue") return message.channel.send({ embeds: [makeVenueEmbed()] });

      if (cmd === "schedule") {
        const sub = (args[0] || "").toLowerCase();
        if (sub === "workshop") return message.channel.send({ embeds: [makeScheduleEmbed("workshop")] });
        if (sub === "launch") return message.channel.send({ embeds: [makeScheduleEmbed("launch")] });
        return message.reply(`ใช้: \`${PREFIX}schedule workshop\` หรือ \`${PREFIX}schedule launch\``);
      }

      if (cmd === "ask") {
        const q = args.join(" ");
        if (!q) return message.reply(`ใช้: \`${PREFIX}ask <คำถาม>\``);
        const { intent, score } = scoreIntent(q);
        const fromKB = score > 0 ? answerByIntent(intent) : null;
        if (fromKB) return message.reply(trunc(fromKB));
        if (!GEMINI_API_KEY || !GEMINI_ENABLED) return message.reply("❌ Gemini is disabled or not configured");
        await message.channel.sendTyping();
        try {
          const ctx = buildGeminiContext(q);
          const ans = await callGemini(ctx);
          return message.reply(trunc(ans));
        } catch (e) {
          console.error("Gemini error:", e);
          return message.reply("เรียก Gemini ไม่สำเร็จ");
        }
      }

      // ---------- ADMIN COMMANDS ----------
      if (cmd === "admin") {
        if (ADMIN_IDS.size && !ADMIN_IDS.has(userId)) return message.reply("Admin only.");

        const toBool = (s) => ['on','true','1','yes','y'].includes(String(s||'').toLowerCase());
        const sub = (args.shift() || "").toLowerCase();

        const showState = () => {
          const obj = {
            prefix: PREFIX,
            auto_reply: AUTO_REPLY,
            auto_mode: AUTO_MODE,
            allowed_channels: ALLOWED_CHANNELS.length ? ALLOWED_CHANNELS : "ALL",
            cooldown_s: COOLDOWN_S,
            max_per_min: MAX_PER_MIN,
            threads: USE_THREADS,
            debug: DEBUG,
            gemini_enabled: GEMINI_ENABLED,
            gemini_model: GEMINI_MODEL,
            gemini_max_out: GEMINI_MAX_OUTPUT_TOKENS,
            gemini_max_in: GEMINI_MAX_INPUT_CHARS
          };
          return 'Current runtime config:\n```json\n' + JSON.stringify(obj, null, 2) + '\n```';
        };

        const help = [
          "Admin commands:",
          `• ${PREFIX}admin help`,
          `• ${PREFIX}admin show`,
          `• ${PREFIX}admin prefix <symbol>`,
          `• ${PREFIX}admin auto <on|off>`,
          `• ${PREFIX}admin mode <all|loose|strict>`,
          `• ${PREFIX}admin channels list`,
          `• ${PREFIX}admin channels set <id,id,...>`,
          `• ${PREFIX}admin channels add <id>`,
          `• ${PREFIX}admin channels remove <id>`,
          `• ${PREFIX}admin cooldown <seconds>`,
          `• ${PREFIX}admin rate <per-minute>`,
          `• ${PREFIX}admin threads <on|off>`,
          `• ${PREFIX}admin debug <on|off>`,
          `• ${PREFIX}admin gemini <on|off>`,
          `• ${PREFIX}admin gemini model <name>`,
          `• ${PREFIX}admin gemini maxout <tokens>`,
          `• ${PREFIX}admin gemini maxin <chars>`
        ].join("\n");

        if (!sub || sub === "help") return message.reply(help);
        if (sub === "show") return message.reply(showState());

        if (sub === "prefix") {
          const p = args[0];
          if (!p) return message.reply("Use: admin prefix <symbol>");
          PREFIX = p;
          return message.reply(`Prefix set to \`${PREFIX}\``);
        }

        if (sub === "auto") {
          AUTO_REPLY = toBool(args[0]);
          return message.reply(`AUTO_REPLY = ${AUTO_REPLY ? "ON" : "OFF"}`);
        }

        if (sub === "mode") {
          const m = (args[0] || "").toLowerCase();
          if (!["all","loose","strict"].includes(m)) return message.reply("Use: admin mode <all|loose|strict>");
          AUTO_MODE = m;
          return message.reply(`AUTO_REPLY_MODE = ${AUTO_MODE}`);
        }

        if (sub === "channels") {
          const op = (args.shift() || "").toLowerCase();
          if (op === "list") {
            return message.reply(ALLOWED_CHANNELS.length ? "Channels: " + ALLOWED_CHANNELS.join(", ") : "Channels: ALL");
          }
          if (op === "set") {
            const list = (args.shift() || "").trim();
            ALLOWED_CHANNELS = list ? list.split(",").map(s => s.trim()).filter(Boolean) : [];
            return message.reply(ALLOWED_CHANNELS.length ? `Set channels: ${ALLOWED_CHANNELS.join(", ")}` : "Allowed ALL channels");
          }
          if (op === "add") {
            const id = (args.shift() || "").trim();
            if (!id) return message.reply("Use: admin channels add <channelId>");
            if (!ALLOWED_CHANNELS.includes(id)) ALLOWED_CHANNELS.push(id);
            return message.reply(`Added channel: ${id}`);
          }
          if (op === "remove") {
            const id = (args.shift() || "").trim();
            if (!id) return message.reply("Use: admin channels remove <channelId>");
            ALLOWED_CHANNELS = ALLOWED_CHANNELS.filter(x => x !== id);
            return message.reply(`Removed channel: ${id}`);
          }
          return message.reply("Use: admin channels <list|set|add|remove> ...");
        }

        if (sub === "cooldown") {
          const s = Number(args[0]);
          if (!Number.isFinite(s) || s < 0) return message.reply("Use: admin cooldown <seconds>");
          COOLDOWN_S = s;
          return message.reply(`Per-user cooldown = ${COOLDOWN_S}s`);
        }

        if (sub === "rate") {
          const n = Number(args[0]);
          if (!Number.isFinite(n) || n < 1) return message.reply("Use: admin rate <per-minute>");
          MAX_PER_MIN = n;
          return message.reply(`Per-channel cap = ${MAX_PER_MIN}/min`);
        }

        if (sub === "threads") {
          USE_THREADS = toBool(args[0]);
          return message.reply(`Reply in threads = ${USE_THREADS ? "ON" : "OFF"}`);
        }

        if (sub === "debug") {
          DEBUG = toBool(args[0]);
          return message.reply(`DEBUG = ${DEBUG ? "ON" : "OFF"}`);
        }

        if (sub === "gemini") {
          const op = (args.shift() || "").toLowerCase();
          if (op === "on" || op === "off") {
            GEMINI_ENABLED = (op === "on");
            return message.reply(`Gemini = ${GEMINI_ENABLED ? "ENABLED" : "DISABLED"} ${!GEMINI_API_KEY ? "(but no API key in .env)" : ""}`.trim());
          }
          if (op === "model") {
            const name = args.shift();
            if (!name) return message.reply("Use: admin gemini model <name>");
            GEMINI_MODEL = name;
            return message.reply(`Gemini model = ${GEMINI_MODEL}`);
          }
          if (op === "maxout") {
            const n = Number(args.shift());
            if (!Number.isInteger(n) || n < 1) return message.reply("Use: admin gemini maxout <tokens>");
            GEMINI_MAX_OUTPUT_TOKENS = n;
            return message.reply(`Gemini maxOutputTokens = ${GEMINI_MAX_OUTPUT_TOKENS}`);
          }
          if (op === "maxin") {
            const n = Number(args.shift());
            if (!Number.isInteger(n) || n < 500) return message.reply("Use: admin gemini maxin <chars>=500+");
            GEMINI_MAX_INPUT_CHARS = n;
            return message.reply(`Gemini maxInputChars = ${GEMINI_MAX_INPUT_CHARS}`);
          }
          return message.reply("Use: admin gemini <on|off> | model <name> | maxout <tokens> | maxin <chars>");
        }

        return; 

      // ---------- Legacy admin-lite----------
      if (!ADMIN_IDS.size || ADMIN_IDS.has(userId)) {
        if (cmd === "reloadconfig") { loadConfigFromDisk(); return message.reply("Reloaded camp.config.json"); }
        if (cmd === "saveconfig")   { saveConfigToDisk();   return message.reply("Saved camp.config.json"); }

        if (cmd === "set") {
          const section = (args.shift() || "").toLowerCase();

          if (section === "price") {
            const tier = (args.shift() || "").toLowerCase();
            const val = Number(args.shift());
            if (["individual","team","spectator"].includes(tier) && Number.isFinite(val)) {
              STATE.camp.pricing[tier] = val; saveConfigToDisk();
              return message.reply(`Updated price ${tier} = ${val}`);
            }
            return message.reply("ใช้: !set price <spectator|individual|team> <number>");
          }

          if (section === "forms" || section === "form") {
            const kind = (args.shift() || "").toLowerCase();
            const url = args.shift();
            if (["individual","team","line","facebook"].includes(kind) && url) {
              STATE.camp.forms[kind] = url; saveConfigToDisk();
              return message.reply(`Updated form ${kind} = ${url}`);
            }
            return message.reply("ใช้: !set forms <individual|team|line|facebook> <url>");
          }

          if (section === "schedule") {
            const rest = args.join(" ").trim();
            if (rest) { STATE.camp.scheduleSummary = rest.replace(/^"|"$/g, ""); saveConfigToDisk(); return message.reply("Updated schedule summary"); }
            return message.reply('ใช้: !set schedule "<summary text>"');
          }

          if (section === "venue" || section === "venues") {
            const sub2 = (args.shift() || "").toLowerCase();
            if (sub2 === "add") {
              const name = args.shift()?.replace(/^"|"$/g, "");
              const url = args.shift()?.replace(/^"|"$/g, "");
              if (name && url) { STATE.venues.push({ name, url }); saveConfigToDisk(); return message.reply(`Added venue: ${name}`); }
              return message.reply('ใช้: !set venue add "Name" "URL"');
            } else if (sub2 === "remove") {
              const idx = Number(args.shift());
              if (Number.isInteger(idx) && idx >= 1 && idx <= STATE.venues.length) {
                const removed = STATE.venues.splice(idx - 1, 1); saveConfigToDisk();
                return message.reply(`Removed venue: ${removed[0].name}`);
              }
              return message.reply("ใช้: !set venue remove <index>");
            }
            return message.reply("ใช้: !set venue <add|remove> ...");
          }
        }
      }

      return;
    }

    // ---------- Auto-reply----------
    if (!channelAllowed(message.channel)) { dlog("skip: channel not allowed"); return; }
    if (!canReply(message.channel.id, message.author.id)) { dlog("skip: rate limit"); return; }
    if (AUTO_MODE !== "all" && !content.trim()) { dlog("skip: empty"); return; }

    await message.channel.sendTyping();

    if (!isCampRelated(content)) {
      return message.reply(getNotCampReply());
    }

    const { intent, score } = scoreIntent(content);
    if (intent === "schedule") {
      if (tnorm.includes("workshop")) return message.channel.send({ embeds: [makeScheduleEmbed("workshop")] });
      if (tnorm.includes("launch"))   return message.channel.send({ embeds: [makeScheduleEmbed("launch")] });
      return message.reply(ansSchedule());
    }
    if (score > 0) {
      const txt = answerByIntent(intent);
      if (txt) return message.reply(trunc(txt));
    }

    const order = ["price","apply","schedule","duration","venue","contact","eligibility","perks","about"];
    for (const it of order) {
      if (INTENT_SYNONYMS[it].some(k => tnorm.includes(k))) {
        const txt = answerByIntent(it);
        if (txt) return message.reply(trunc(txt));
      }
    }

    if (GEMINI_API_KEY && GEMINI_ENABLED) {
      try {
        const ctx = buildGeminiContext(content);
        const llm = await callGemini(ctx);
        return message.reply(trunc(llm));
      } catch (e) {
        console.error("Gemini error:", e);
      }
    }

    return message.reply(`ขออภัย ยังไม่มีคำตอบเฉพาะสำหรับคำถามนี้ ลองพิมพ์: \`ราคา\`, \`สมัคร\`, \`ตาราง\`, \`สถานที่\` หรือ \`${PREFIX}help\``);

  } catch (err) {
    console.error("Handler error:", err);
  }
});

client.login(TOKEN);
