const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const {
  MemoryStore,
  FileStore,
  createBooking,
  closeSlot,
  releaseSlot,
  cancelBooking,
  publicState,
  adminState,
  isPast,
  normalizePhone,
} = require("./reservations");
const { useStore, publicHandler, adminHandler } = require("./handlers");

const NOW = new Date("2026-10-12T00:00:00+09:00");

function guest(name = "原 亮平") {
  return {
    date: "2026-11-21",
    time: "11:00",
    name,
    phone: "090-1234-5678",
    email: "guest@example.com",
    note: "初めてです",
  };
}

test("normalizes Japanese phone numbers", () => {
  assert.equal(normalizePhone("０９０-１２３４-５６７８"), "09012345678");
  assert.equal(normalizePhone("+81 90 1234 5678"), "09012345678");
  assert.equal(normalizePhone("052-784-5492"), "0527845492");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("00000000000"), null);
});

test("a slot can be booked once", async () => {
  const store = new MemoryStore();
  const booking = await createBooking(store, guest(), NOW);
  assert.equal(booking.phone, "09012345678");
  assert.equal(booking.source, "web");
  await assert.rejects(
    () => createBooking(store, guest("別の人"), NOW),
    (error) => error.code === "taken"
  );
});

test("parallel bookings keep a single reservation", async () => {
  const store = new MemoryStore();
  const results = await Promise.allSettled([
    createBooking(store, guest("A"), NOW),
    createBooking(store, guest("B"), NOW),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  assert.equal(fulfilled.length, 1);
});

test("public availability hides personal details", async () => {
  const store = new MemoryStore();
  await createBooking(store, guest(), NOW);
  const state = await publicState(store, NOW);
  const body = JSON.stringify(state);
  assert.equal(body.includes("09012345678"), false);
  assert.equal(body.includes("guest@example.com"), false);
  assert.equal(body.includes("cancelToken"), false);
  assert.equal(body.includes("原"), false);
  const slot = state.days[0].slots[0];
  assert.equal(slot.status, "taken");
  assert.equal(state.days[0].slots[1].status, "open");
  assert.equal(state.accepting, true);
});

test("cancellation requires the token issued to that guest", async () => {
  const store = new MemoryStore();
  const booking = await createBooking(store, guest(), NOW);
  await assert.rejects(
    () => cancelBooking(store, { date: booking.date, time: booking.time, cancelToken: "nope" }),
    (error) => error.code === "denied"
  );
  await cancelBooking(store, {
    date: booking.date,
    time: booking.time,
    cancelToken: booking.cancelToken,
  });
  const state = await publicState(store, NOW);
  assert.equal(state.days[0].slots[0].status, "open");
});

test("the studio can close a slot and later reopen it", async () => {
  const store = new MemoryStore();
  await closeSlot(store, { date: "2026-11-21", time: "13:00", note: "休憩" }, NOW);
  await assert.rejects(
    () => createBooking(store, { ...guest(), time: "13:00" }, NOW),
    (error) => error.code === "taken"
  );
  const hidden = await publicState(store, NOW);
  assert.equal(hidden.days[0].slots[2].status, "taken");
  const admin = await adminState(store, NOW);
  const closed = admin.days[0].slots.find((slot) => slot.time === "13:00");
  assert.equal(closed.status, "closed");
  assert.equal(closed.booking.note, "休憩");
  assert.equal(Object.hasOwn(closed.booking, "cancelToken"), false);
  await releaseSlot(store, { date: "2026-11-21", time: "13:00" });
  const reopened = await publicState(store, NOW);
  assert.equal(reopened.days[0].slots[2].status, "open");
});

test("finished slots and an undurable store do not accept bookings", async () => {
  const during = new Date("2026-11-21T12:00:00+09:00");
  assert.equal(isPast("2026-11-21", "11:00", during), true);
  assert.equal(isPast("2026-11-21", "12:00", during), false);
  const store = new MemoryStore();
  await assert.rejects(
    () => createBooking(store, guest(), during),
    (error) => error.code === "past"
  );
  store.durable = false;
  await assert.rejects(
    () => createBooking(store, { ...guest(), time: "15:00" }, NOW),
    (error) => error.code === "unavailable"
  );
  const state = await publicState(store, NOW);
  assert.equal(state.accepting, false);
  assert.equal(state.days[0].slots[4].status, "unknown");
});

test("honeypot and invalid contact details are rejected", async () => {
  const store = new MemoryStore();
  await assert.rejects(
    () => createBooking(store, { ...guest(), company: "spam" }, NOW),
    (error) => error.code === "invalid"
  );
  await assert.rejects(
    () => createBooking(store, { ...guest(), phone: "abc" }, NOW),
    (error) => error.code === "invalid"
  );
  const state = await publicState(store, NOW);
  assert.equal(state.days[0].slots[0].status, "open");
});

test("file store keeps a booking across instances", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moggys-test-"));
  const file = path.join(process.cwd(), "data", `test-${Date.now()}.json`);
  const first = new FileStore(file);
  assert.equal(first.durable, true);
  await createBooking(first, guest(), NOW);
  const second = new FileStore(file);
  const state = await publicState(second, NOW);
  assert.equal(state.days[0].slots[0].status, "taken");
  fs.unlinkSync(file);
  fs.rmSync(dir, { recursive: true, force: true });
});

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(payload) {
      this.body = payload;
      this.json = JSON.parse(payload);
    },
  };
}

function mockReq(method, body, headers = {}) {
  return { method, headers, body };
}

test("http booking stays private and blocks the same hour", async () => {
  const previous = process.env.EVENT_ADMIN_PASSWORD;
  process.env.EVENT_ADMIN_PASSWORD = "test-password";
  useStore(new MemoryStore());
  try {
    const created = mockRes();
    await publicHandler(mockReq("POST", guest()), created);
    assert.equal(created.statusCode, 201);
    assert.ok(created.json.reservation.cancelToken);

    const listed = mockRes();
    await publicHandler(mockReq("GET"), listed);
    assert.equal(JSON.stringify(listed.json).includes("09012345678"), false);
    assert.equal(listed.json.days[0].slots[0].status, "taken");

    const again = mockRes();
    await publicHandler(mockReq("POST", guest("もう一人")), again);
    assert.equal(again.statusCode, 409);

    const denied = mockRes();
    await adminHandler(mockReq("GET", null, { authorization: "Bearer wrong" }), denied);
    assert.equal(denied.statusCode, 403);

    const allowed = mockRes();
    await adminHandler(
      mockReq("GET", null, { authorization: "Bearer test-password" }),
      allowed
    );
    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.json.days[0].slots[0].booking.phone, "09012345678");
  } finally {
    if (previous == null) delete process.env.EVENT_ADMIN_PASSWORD;
    else process.env.EVENT_ADMIN_PASSWORD = previous;
    useStore(undefined);
  }
});
