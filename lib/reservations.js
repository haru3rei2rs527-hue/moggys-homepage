const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DAYS = [
  { date: "2026-11-21", heading: "11.21 Sat", ja: "11月21日（土）" },
  { date: "2026-11-22", heading: "11.22 Sun", ja: "11月22日（日）" },
];

const TIMES = ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

const REDIS_KEY = "moggys:rendo-trunk-2026";

class ReservationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReservationError";
    this.code = code;
  }
}

function slotKey(date, time) {
  return `${date}T${time}`;
}

function endLabel(time) {
  const hour = Number(time.slice(0, 2)) + 1;
  return `${String(hour).padStart(2, "0")}:00`;
}

function knownSlot(date, time) {
  return DAYS.some((day) => day.date === date) && TIMES.includes(time);
}

function dayByDate(date) {
  return DAYS.find((day) => day.date === date);
}

function tokyoStamp(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const hour = map.hour === "24" ? "00" : map.hour;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(hour) * 60 + Number(map.minute),
  };
}

function isPast(date, time, now) {
  const stamp = tokyoStamp(now);
  if (stamp.date > date) return true;
  if (stamp.date < date) return false;
  const [hour, minute] = endLabel(time).split(":").map(Number);
  return stamp.minutes >= hour * 60 + minute;
}

function eventEnded(now) {
  return DAYS.every((day) => TIMES.every((time) => isPast(day.date, time, now)));
}

function normalizeName(value) {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 40) return null;
  return name;
}

function normalizePhone(value) {
  let raw = String(value ?? "");
  raw = raw.replace(/[０-９＋]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  raw = raw.replace(/[^\d+]/g, "");
  if (raw.startsWith("+81")) raw = raw.slice(3);
  else if (/^81\d{9,11}$/.test(raw)) raw = raw.slice(2);
  if (!raw.startsWith("0")) raw = `0${raw}`;
  if (!/^0[1-9]\d{8,9}$/.test(raw)) return null;
  return raw;
}

function normalizeEmail(value) {
  const email = String(value ?? "").trim();
  if (!email) return "";
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizeNote(value) {
  const note = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (note.length > 400) return null;
  return note;
}

function isEphemeralPath(file) {
  const resolved = path.resolve(file);
  const tmp = path.resolve(os.tmpdir());
  return resolved === tmp || resolved.startsWith(`${tmp}${path.sep}`);
}

class MemoryStore {
  constructor() {
    this.slots = {};
    this.durable = true;
    this.tail = Promise.resolve();
  }

  run(fn) {
    const job = this.tail.then(fn, fn);
    this.tail = job.then(
      () => {},
      () => {}
    );
    return job;
  }

  getAll() {
    return this.run(async () => structuredClone(this.slots));
  }

  reserve(id, booking) {
    return this.run(async () => {
      if (this.slots[id]) return "TAKEN";
      this.slots[id] = structuredClone(booking);
      return "OK";
    });
  }

  release(id, auth) {
    return this.run(async () => {
      const row = this.slots[id];
      if (!row) return "MISSING";
      if (!auth.admin && row.cancelToken !== auth.token) return "DENIED";
      delete this.slots[id];
      return "OK";
    });
  }
}

class FileStore {
  constructor(file) {
    this.file = file;
    this.durable = !isEphemeralPath(file);
    this.tail = Promise.resolve();
  }

  run(fn) {
    const job = this.tail.then(fn, fn);
    this.tail = job.then(
      () => {},
      () => {}
    );
    return job;
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (!data || typeof data !== "object" || Array.isArray(data)) return {};
      return data;
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }

  save(slots) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(slots));
    fs.renameSync(tmp, this.file);
  }

  getAll() {
    return this.run(async () => structuredClone(this.load()));
  }

  reserve(id, booking) {
    return this.run(async () => {
      const slots = this.load();
      if (slots[id]) return "TAKEN";
      slots[id] = booking;
      this.save(slots);
      return "OK";
    });
  }

  release(id, auth) {
    return this.run(async () => {
      const slots = this.load();
      const row = slots[id];
      if (!row) return "MISSING";
      if (!auth.admin && row.cancelToken !== auth.token) return "DENIED";
      delete slots[id];
      this.save(slots);
      return "OK";
    });
  }
}

class RedisStore {
  constructor(url, token) {
    this.url = String(url).replace(/\/$/, "");
    this.token = token;
    this.durable = true;
  }

  async command(args) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      throw new Error(data.error || `Redis request failed (${response.status})`);
    }
    return data.result;
  }

  async readSlots() {
    const raw = await this.command(["GET", REDIS_KEY]);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return data;
  }

  getAll() {
    return this.readSlots();
  }

  async reserve(id, booking) {
    const script = `
local raw = redis.call('GET', KEYS[1])
local data = {}
if raw and raw ~= '' then
  data = cjson.decode(raw)
end
if data[ARGV[1]] ~= nil then
  return 'TAKEN'
end
data[ARGV[1]] = cjson.decode(ARGV[2])
redis.call('SET', KEYS[1], cjson.encode(data))
return 'OK'`;
    return this.command(["EVAL", script, 1, REDIS_KEY, id, JSON.stringify(booking)]);
  }

  async release(id, auth) {
    const script = `
local raw = redis.call('GET', KEYS[1])
if not raw or raw == '' then
  return 'MISSING'
end
local data = cjson.decode(raw)
local row = data[ARGV[1]]
if row == nil then
  return 'MISSING'
end
if ARGV[2] ~= 'admin' and row['cancelToken'] ~= ARGV[3] then
  return 'DENIED'
end
data[ARGV[1]] = nil
if next(data) == nil then
  redis.call('DEL', KEYS[1])
else
  redis.call('SET', KEYS[1], cjson.encode(data))
end
return 'OK'`;
    return this.command([
      "EVAL",
      script,
      1,
      REDIS_KEY,
      id,
      auth.admin ? "admin" : "guest",
      auth.token || "",
    ]);
  }
}

function resolveReservationsFile() {
  if (process.env.RESERVATIONS_FILE) return path.resolve(process.env.RESERVATIONS_FILE);
  const dir = path.join(process.cwd(), "data");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".write-probe");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return path.join(dir, "reservations.json");
  } catch {
    return path.join(os.tmpdir(), "moggys-reservations.json");
  }
}

function createStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new RedisStore(url, token);
  return new FileStore(resolveReservationsFile());
}

function assertAvailable(store) {
  if (!store.durable) {
    throw new ReservationError(
      "unavailable",
      "ウェブでの予約は、まだ受け付けていません。お電話（052-784-5492）でご連絡ください。"
    );
  }
}

function assertSlotOpen(date, time, now) {
  if (!knownSlot(date, time)) {
    throw new ReservationError("invalid", "時間を選び直してください。");
  }
  if (isPast(date, time, now)) {
    throw new ReservationError("past", "この時間は受付を終了しています。");
  }
}

async function createBooking(store, input, now = new Date(), channel = "web") {
  assertAvailable(store);
  if (String(input.company || "").trim()) {
    throw new ReservationError("invalid", "送信できませんでした。");
  }
  const date = String(input.date || "");
  const time = String(input.time || "");
  assertSlotOpen(date, time, now);
  const name = normalizeName(input.name);
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const note = normalizeNote(input.note);
  if (!name) throw new ReservationError("invalid", "お名前を入力してください。");
  if (!phone) throw new ReservationError("invalid", "電話番号を確認してください。");
  if (email == null) throw new ReservationError("invalid", "メールアドレスを確認してください。");
  if (note == null) throw new ReservationError("invalid", "メモは400文字以内にしてください。");

  const booking = {
    code: crypto.randomBytes(4).toString("hex").toUpperCase(),
    cancelToken: crypto.randomBytes(24).toString("hex"),
    date,
    time,
    name,
    phone,
    email,
    note,
    source: channel === "phone" ? "phone" : "web",
    createdAt: now.toISOString(),
  };
  const result = await store.reserve(slotKey(date, time), booking);
  if (result !== "OK") {
    throw new ReservationError("taken", "この枠は先ほど埋まりました。別の時間を選んでください。");
  }
  return booking;
}

async function closeSlot(store, input, now = new Date()) {
  assertAvailable(store);
  const date = String(input.date || "");
  const time = String(input.time || "");
  assertSlotOpen(date, time, now);
  const note = normalizeNote(input.note);
  if (note == null) throw new ReservationError("invalid", "メモは400文字以内にしてください。");
  const booking = {
    code: "",
    cancelToken: crypto.randomBytes(24).toString("hex"),
    date,
    time,
    name: "",
    phone: "",
    email: "",
    note,
    source: "closed",
    createdAt: now.toISOString(),
  };
  const result = await store.reserve(slotKey(date, time), booking);
  if (result !== "OK") {
    throw new ReservationError("taken", "この枠にはすでに予約があります。");
  }
  return booking;
}

async function releaseSlot(store, input) {
  const date = String(input.date || "");
  const time = String(input.time || "");
  if (!knownSlot(date, time)) {
    throw new ReservationError("invalid", "時間を選び直してください。");
  }
  const result = await store.release(slotKey(date, time), { admin: true, token: "" });
  if (result !== "OK") {
    throw new ReservationError("missing", "この枠はすでに空いています。");
  }
}

async function cancelBooking(store, input) {
  const date = String(input.date || "");
  const time = String(input.time || "");
  const token = String(input.cancelToken || "");
  if (!knownSlot(date, time) || !token) {
    throw new ReservationError("invalid", "取り消せませんでした。");
  }
  const result = await store.release(slotKey(date, time), { admin: false, token });
  if (result === "MISSING") {
    throw new ReservationError("missing", "この予約は見つかりません。");
  }
  if (result !== "OK") {
    throw new ReservationError("denied", "取り消せませんでした。");
  }
}

function slotView(date, time, row, now, live) {
  if (isPast(date, time, now)) return "past";
  if (!live) return "unknown";
  if (!row) return "open";
  if (row.source === "closed") return "closed";
  return "taken";
}

function toPublicBooking(row) {
  if (!row) return null;
  return {
    code: row.code,
    name: row.name,
    phone: row.phone,
    email: row.email,
    note: row.note,
    source: row.source,
    createdAt: row.createdAt,
  };
}

async function publicState(store, now = new Date()) {
  let slots = {};
  let readable = true;
  try {
    slots = await store.getAll();
  } catch {
    readable = false;
  }
  const live = Boolean(store.durable && readable);
  const days = DAYS.map((day) => ({
    date: day.date,
    heading: day.heading,
    ja: day.ja,
    slots: TIMES.map((time) => {
      const status = slotView(day.date, time, slots[slotKey(day.date, time)], now, live);
      return {
        time,
        end: endLabel(time),
        status: status === "closed" ? "taken" : status,
      };
    }),
  }));
  return {
    accepting: live && !eventEnded(now),
    ended: eventEnded(now),
    days,
  };
}

async function adminState(store, now = new Date()) {
  const slots = await store.getAll();
  const live = Boolean(store.durable);
  return {
    durable: live,
    accepting: live && !eventEnded(now),
    ended: eventEnded(now),
    days: DAYS.map((day) => ({
      date: day.date,
      heading: day.heading,
      ja: day.ja,
      slots: TIMES.map((time) => {
        const row = slots[slotKey(day.date, time)] || null;
        return {
          time,
          end: endLabel(time),
          status: slotView(day.date, time, row, now, true),
          booking: toPublicBooking(row),
        };
      }),
    })),
  };
}

function reservationPayload(booking) {
  const day = dayByDate(booking.date);
  return {
    code: booking.code,
    date: booking.date,
    time: booking.time,
    end: endLabel(booking.time),
    ja: day ? day.ja : booking.date,
    cancelToken: booking.cancelToken,
  };
}

module.exports = {
  DAYS,
  TIMES,
  ReservationError,
  MemoryStore,
  FileStore,
  RedisStore,
  createStore,
  isEphemeralPath,
  isPast,
  normalizePhone,
  createBooking,
  closeSlot,
  releaseSlot,
  cancelBooking,
  publicState,
  adminState,
  reservationPayload,
};
