(() => {
  const board = document.querySelector(".slot-board");
  const form = document.getElementById("reserve-form");
  const success = document.getElementById("reserve-success");
  const status = document.getElementById("reserve-status");
  const error = document.getElementById("reserve-error");
  const selectedLabel = document.getElementById("selected-slot");
  const again = document.getElementById("reserve-again");
  if (!board || !form || !success) return;

  const slots = [...board.querySelectorAll(".slot")];
  const storageKey = "moggys-rendo-cancel";
  let selected = null;
  let current = null;
  let accepting = false;
  let loadToken = 0;

  const labels = {
    open: "空席",
    taken: "満席",
    past: "終了",
    unknown: "—",
  };

  const byKey = (date, time) => slots.find((slot) => slot.dataset.date === date && slot.dataset.time === time);

  const readSaved = () => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  };

  const writeSaved = (reservation) => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(reservation));
    } catch {
      return;
    }
  };

  const clearSaved = () => {
    sessionStorage.removeItem(storageKey);
  };

  const setStatus = (message) => {
    status.textContent = message || "";
  };

  const setError = (message) => {
    error.textContent = message || "";
  };

  const normalizePhone = (value) => {
    let raw = String(value ?? "");
    raw = raw.replace(/[０-９＋]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
    raw = raw.replace(/[^\d+]/g, "");
    if (raw.startsWith("+81")) raw = raw.slice(3);
    else if (/^81\d{9,11}$/.test(raw)) raw = raw.slice(2);
    if (!raw.startsWith("0")) raw = `0${raw}`;
    if (!/^0[1-9]\d{8,9}$/.test(raw)) return null;
    return raw;
  };

  const fieldRules = {
    name: (value) => {
      const name = String(value ?? "").replace(/\s+/g, " ").trim();
      if (!name) return "お名前を入力してください。";
      if (name.length > 40) return "お名前は40文字以内にしてください。";
      return "";
    },
    phone: (value) => {
      if (!String(value ?? "").trim()) return "電話番号を入力してください。";
      if (!normalizePhone(value)) return "桁数を確認してください。例: 090-1234-5678";
      return "";
    },
    email: (value) => {
      const email = String(value ?? "").trim();
      if (!email) return "";
      if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return "メールアドレスの形を確認してください。空欄でも送れます。";
      }
      return "";
    },
    note: (value) => {
      if (String(value ?? "").trim().length > 400) return "メモは400文字以内にしてください。";
      return "";
    },
  };

  const fieldOk = {
    name: "このお名前で送れます。",
    phone: "この番号で送れます。",
    email: "このメールで送れます。",
    note: "この内容で送れます。",
  };

  const touched = {};
  let submitted = false;

  const paintField = (key) => {
    const wrap = document.getElementById(`field-${key}`);
    const input = document.getElementById(`guest-${key}`);
    const message = document.getElementById(`guest-${key}-error`);
    const ok = document.getElementById(`guest-${key}-ok`);
    if (!wrap || !input || !message) return "";
    const show = Boolean(touched[key] || submitted);
    const problem = show ? fieldRules[key](input.value) : "";
    const filled = String(input.value ?? "").trim().length > 0;
    const good = show && !problem && filled;
    wrap.classList.toggle("is-invalid", Boolean(problem));
    wrap.classList.toggle("is-valid", good);
    input.setAttribute("aria-invalid", problem ? "true" : "false");
    message.hidden = !problem;
    message.textContent = problem;
    if (ok) {
      ok.hidden = !good;
      ok.textContent = good ? fieldOk[key] : "";
    }
    return problem;
  };

  const paintFields = () => Object.keys(fieldRules).map(paintField).filter(Boolean);

  const clearFields = () => {
    submitted = false;
    Object.keys(fieldRules).forEach((key) => {
      touched[key] = false;
      const wrap = document.getElementById(`field-${key}`);
      const input = wrap && wrap.querySelector("input, textarea");
      const message = document.getElementById(`guest-${key}-error`);
      if (!wrap || !input || !message) return;
      const ok = document.getElementById(`guest-${key}-ok`);
      wrap.classList.remove("is-invalid", "is-valid");
      input.setAttribute("aria-invalid", "false");
      message.hidden = true;
      message.textContent = "";
      if (ok) {
        ok.hidden = true;
        ok.textContent = "";
      }
    });
  };

  const showServerError = (message) => {
    const pairs = [
      [/お名前/, "name"],
      [/電話/, "phone"],
      [/メール/, "email"],
      [/メモ/, "note"],
    ];
    const hit = pairs.find(([pattern]) => pattern.test(message));
    if (!hit) {
      setError(message);
      scrollToEl(error);
      return;
    }
    submitted = true;
    touched[hit[1]] = true;
    const input = document.getElementById(`guest-${hit[1]}`);
    const messageEl = document.getElementById(`guest-${hit[1]}-error`);
    const wrap = document.getElementById(`field-${hit[1]}`);
    if (!input || !messageEl || !wrap) {
      setError(message);
      scrollToEl(error);
      return;
    }
    wrap.classList.add("is-invalid");
    wrap.classList.remove("is-valid");
    input.setAttribute("aria-invalid", "true");
    messageEl.hidden = false;
    messageEl.textContent = message;
    const ok = document.getElementById(`guest-${hit[1]}-ok`);
    if (ok) ok.hidden = true;
    input.focus();
    scrollToEl(wrap);
  };

  Object.keys(fieldRules).forEach((key) => {
    const wrap = document.getElementById(`field-${key}`);
    const input = wrap && wrap.querySelector("input, textarea");
    if (!input) return;
    input.addEventListener("blur", () => {
      touched[key] = true;
      paintField(key);
    });
    input.addEventListener("input", () => {
      if (touched[key] || submitted) paintField(key);
    });
  });

  const showForm = () => {
    success.hidden = true;
    again.hidden = true;
    form.hidden = !(accepting && selected);
  };

  const scrollToEl = (el) => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    const top = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo(0, Math.max(0, top));
    root.style.scrollBehavior = previous;
  };

  const showSuccess = (reservation, scroll) => {
    current = reservation;
    writeSaved(reservation);
    document.getElementById("reserve-success-text").textContent =
      `${reservation.ja} ${reservation.time}–${reservation.end} で承りました。当日、工房でお待ちしています。`;
    document.getElementById("reserve-code").textContent = reservation.code;
    form.hidden = true;
    success.hidden = false;
    again.hidden = false;
    if (scroll) {
      scrollToEl(success);
      setTimeout(() => scrollToEl(success), 400);
    }
  };

  const paint = (state) => {
    accepting = Boolean(state && state.accepting);
    const known = new Map();
    if (state) {
      state.days.forEach((day) => {
        day.slots.forEach((slot) => known.set(`${day.date}T${slot.time}`, slot.status));
      });
    }

    slots.forEach((button) => {
      const key = `${button.dataset.date}T${button.dataset.time}`;
      const slotStatus = known.get(key) || "unknown";
      const open = accepting && slotStatus === "open";
      button.disabled = !open;
      button.classList.toggle("is-taken", slotStatus === "taken");
      button.classList.toggle("is-past", slotStatus === "past");
      button.querySelector(".slot__state").textContent = labels[slotStatus] || "—";
      const pressed = selected && selected.date === button.dataset.date && selected.time === button.dataset.time && open;
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
      button.classList.toggle("is-selected", Boolean(pressed));
    });

    if (selected) {
      const still = known.get(`${selected.date}T${selected.time}`);
      if (still !== "open" || !accepting) selected = null;
    }

    if (selected) {
      selectedLabel.textContent = `${selected.ja} ${selected.time}–${selected.end}`;
    } else {
      selectedLabel.textContent = "時間を選択してください。";
    }

    if (state && state.ended) {
      setStatus("この会の受付は終了しました。");
    } else if (!accepting) {
      setStatus("ウェブ予約の準備中です。空き状況はお電話（052-784-5492）でご確認ください。");
    } else if (!success.hidden) {
      setStatus("");
    } else {
      setStatus("空席を選ぶと、入力欄が開きます。");
    }
    if (success.hidden) showForm();
  };

  const load = async () => {
    const token = ++loadToken;
    try {
      const response = await fetch("/api/reservations.php", { cache: "no-store" });
      if (token !== loadToken) return;
      if (!response.ok) throw new Error("status");
      const data = await response.json();
      if (token !== loadToken) return;
      paint(data);
    } catch {
      if (token !== loadToken) return;
      accepting = false;
      paint(null);
      setStatus("空き状況を確認できません。お電話（052-784-5492）でご予約ください。");
      form.hidden = true;
    }
  };

  board.addEventListener("click", (event) => {
    const button = event.target.closest(".slot");
    if (!button || button.disabled) return;
    const day = button.closest(".slot-day");
    const [hour, minute] = button.dataset.time.split(":");
    selected = {
      date: button.dataset.date,
      time: button.dataset.time,
      end: `${String(Number(hour) + 1).padStart(2, "0")}:${minute}`,
      ja: day.querySelector(".slot-day__date").textContent,
    };
    slots.forEach((slot) => {
      const on = slot === button;
      slot.classList.toggle("is-selected", on);
      slot.setAttribute("aria-pressed", on ? "true" : "false");
    });
    selectedLabel.textContent = `${selected.ja} ${selected.time}–${selected.end}`;
    form.hidden = false;
    setError("");
    document.getElementById("guest-name").focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError("");
    submitted = true;
    if (!selected) {
      setError("時間を選んでください。");
      scrollToEl(status);
      return;
    }
    const problems = paintFields();
    if (problems.length) {
      const first = form.querySelector(".field.is-invalid input, .field.is-invalid textarea");
      if (first) {
        first.focus();
        scrollToEl(first.closest(".field"));
      }
      return;
    }
    const name = document.getElementById("guest-name").value.trim();
    const phone = document.getElementById("guest-phone").value.trim();
    const company = form.querySelector("[name=company]");
    const submit = document.getElementById("reserve-submit");
    submit.disabled = true;
    submit.textContent = "送信中…";
    try {
      const response = await fetch("/api/reservations.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selected.date,
          time: selected.time,
          name,
          phone,
          email: document.getElementById("guest-email").value,
          note: document.getElementById("guest-note").value,
          company: company ? company.value : "",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.message || "送信できませんでした。";
        await load();
        setStatus(message);
        showServerError(message);
        return;
      }
      form.reset();
      clearFields();
      selected = null;
      showSuccess(data.reservation, true);
      await load();
    } catch {
      setError("送信できませんでした。時間をおいてもう一度お試しください。");
      scrollToEl(error);
    } finally {
      submit.disabled = false;
      submit.textContent = "この時間で予約する";
    }
  });

  const cancel = async (reservation) => {
    const response = await fetch("/api/reservations.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cancel",
        date: reservation.date,
        time: reservation.time,
        cancelToken: reservation.cancelToken,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && data.error !== "missing") {
      setStatus(data.message || "取り消せませんでした。お電話でご連絡ください。");
      return;
    }
    clearSaved();
    current = null;
    success.hidden = true;
    again.hidden = true;
    await load();
    setStatus("予約を取り消しました。別の時間を選べます。");
  };

  document.getElementById("cancel-reservation").addEventListener("click", () => {
    if (current) cancel(current);
  });

  document.getElementById("add-calendar").addEventListener("click", () => {
    if (!current) return;
    const start = `${current.date.replaceAll("-", "")}T${current.time.replace(":", "")}00`;
    const end = `${current.date.replaceAll("-", "")}T${current.end.replace(":", "")}00`;
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MOGGYS SHOE STUDIO//RENDO Event//JA",
      "BEGIN:VEVENT",
      `UID:${current.code}@moggys-shoe-studio.com`,
      `DTSTART;TZID=Asia/Tokyo:${start}`,
      `DTEND;TZID=Asia/Tokyo:${end}`,
      "SUMMARY:RENDO パターンオーダー会",
      "LOCATION:MOGGYS SHOE STUDIO 名古屋市千種区高見1-8-5",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    link.download = "rendo-pattern-order.ics";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  document.getElementById("reserve-reset").addEventListener("click", () => {
    again.hidden = true;
    form.hidden = !accepting;
    selected = null;
    slots.forEach((slot) => {
      slot.classList.remove("is-selected");
      slot.setAttribute("aria-pressed", "false");
    });
    selectedLabel.textContent = "時間を選択してください。";
    setStatus("別の時間を選ぶ場合も、お名前と電話番号が必要です。");
  });

  const saved = readSaved();
  if (saved && saved.code && saved.cancelToken) showSuccess(saved, false);

  load();
})();
