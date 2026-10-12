const {
  ReservationError,
  createStore,
  createBooking,
  closeSlot,
  releaseSlot,
  cancelBooking,
  publicState,
  adminState,
  reservationPayload,
} = require("./reservations");

const STATUS = {
  invalid: 400,
  past: 409,
  taken: 409,
  missing: 404,
  denied: 403,
  unavailable: 503,
};

let storeOverride;

function useStore(store) {
  storeOverride = store;
}

function getStore() {
  if (storeOverride) return storeOverride;
  if (!getStore.current) getStore.current = createStore();
  return getStore.current;
}

function adminPassword() {
  return process.env.EVENT_ADMIN_PASSWORD || "";
}

function safeEqual(left, right) {
  const crypto = require("crypto");
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function authorized(req) {
  const expected = adminPassword();
  if (!expected) return false;
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return safeEqual(token, expected);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sendError(res, error) {
  if (error instanceof ReservationError) {
    send(res, STATUS[error.code] || 400, {
      ok: false,
      error: error.code,
      message: error.message,
    });
    return;
  }
  console.error(error);
  send(res, 500, {
    ok: false,
    error: "error",
    message: "処理できませんでした。時間をおいてもう一度お試しください。",
  });
}

async function readJson(req) {
  if (req.body != null && req.body !== "") {
    if (typeof req.body === "string") {
      if (req.body.length > 10000) {
        throw new ReservationError("invalid", "送信内容が大きすぎます。");
      }
      try {
        return JSON.parse(req.body);
      } catch {
        throw new ReservationError("invalid", "送信できませんでした。");
      }
    }
    if (typeof req.body === "object") return req.body;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10000) throw new ReservationError("invalid", "送信内容が大きすぎます。");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ReservationError("invalid", "送信できませんでした。");
  }
}

async function publicHandler(req, res) {
  try {
    const store = getStore();
    if (req.method === "GET") {
      const state = await publicState(store);
      send(res, 200, { ok: true, ...state });
      return;
    }
    if (req.method === "POST") {
      const body = await readJson(req);
      const booking = await createBooking(store, body, new Date(), "web");
      send(res, 201, { ok: true, reservation: reservationPayload(booking) });
      return;
    }
    if (req.method === "DELETE") {
      const body = await readJson(req);
      await cancelBooking(store, body);
      send(res, 200, { ok: true, message: "予約を取り消しました。" });
      return;
    }
    send(res, 405, { ok: false, error: "method", message: "この操作はできません。" });
  } catch (error) {
    sendError(res, error);
  }
}

async function adminHandler(req, res) {
  try {
    const store = getStore();
    if (req.method === "GET") {
      if (!authorized(req)) {
        send(res, 403, { ok: false, error: "denied", message: "パスワードが違います。" });
        return;
      }
      const state = await adminState(store);
      send(res, 200, { ok: true, ...state });
      return;
    }
    if (req.method !== "POST") {
      send(res, 405, { ok: false, error: "method", message: "この操作はできません。" });
      return;
    }

    const body = await readJson(req);
    if (body.action === "login") {
      const expected = adminPassword();
      if (!expected) {
        send(res, 503, {
          ok: false,
          error: "unavailable",
          message: "管理パスワードが未設定です。",
        });
        return;
      }
      if (!safeEqual(String(body.password || ""), expected)) {
        send(res, 403, { ok: false, error: "denied", message: "パスワードが違います。" });
        return;
      }
      send(res, 200, { ok: true });
      return;
    }

    if (!authorized(req)) {
      send(res, 403, { ok: false, error: "denied", message: "パスワードが違います。" });
      return;
    }

    if (body.action === "close") {
      await closeSlot(store, body);
      send(res, 200, { ok: true });
      return;
    }
    if (body.action === "release") {
      await releaseSlot(store, body);
      send(res, 200, { ok: true });
      return;
    }
    if (body.action === "book") {
      const booking = await createBooking(store, body, new Date(), "phone");
      send(res, 201, { ok: true, reservation: reservationPayload(booking) });
      return;
    }
    send(res, 400, { ok: false, error: "invalid", message: "操作を確認してください。" });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = {
  useStore,
  getStore,
  publicHandler,
  adminHandler,
};
