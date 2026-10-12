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
      const response = await fetch("/api/reservations", { cache: "no-store" });
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
    if (!selected) {
      setError("時間を選んでください。");
      return;
    }
    const name = document.getElementById("guest-name").value.trim();
    const phone = document.getElementById("guest-phone").value.trim();
    if (!name || !phone) {
      setError("お名前と電話番号を入力してください。");
      return;
    }
    const submit = document.getElementById("reserve-submit");
    submit.disabled = true;
    submit.textContent = "送信中…";
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selected.date,
          time: selected.time,
          name,
          phone,
          email: document.getElementById("guest-email").value,
          note: document.getElementById("guest-note").value,
          company: "",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.message || "送信できませんでした。";
        await load();
        setError(message);
        setStatus(message);
        scrollToEl(form.hidden ? status : error);
        return;
      }
      form.reset();
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
    const response = await fetch("/api/reservations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
