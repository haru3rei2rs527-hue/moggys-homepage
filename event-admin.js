(() => {
  const login = document.getElementById("admin-login");
  const app = document.getElementById("admin-app");
  const board = document.getElementById("admin-board");
  const detail = document.getElementById("admin-detail");
  const warning = document.getElementById("admin-warning");
  const status = document.getElementById("admin-status");
  const loginError = document.getElementById("admin-login-error");
  const storageKey = "moggys-event-admin";
  let password = sessionStorage.getItem(storageKey) || "";
  let state = null;
  let picked = null;

  const sourceLabel = { web: "ウェブ", phone: "電話", closed: "受付停止" };
  const statusLabel = { open: "空席", taken: "予約あり", closed: "停止", past: "終了", unknown: "—" };

  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${password}`,
  });

  const formatWhen = (value) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };

  const formatPhone = (digits) => {
    if (/^0[789]0\d{8}$/.test(digits)) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    return digits;
  };

  const showLogin = () => {
    app.hidden = true;
    login.hidden = false;
  };

  const field = (label, control) => {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const title = document.createElement("span");
    title.textContent = label;
    wrap.append(title, control);
    return wrap;
  };

  const renderDetail = () => {
    detail.hidden = !picked;
    detail.replaceChildren();
    if (!picked) return;
    const slot = state.days
      .find((day) => day.date === picked.date)
      .slots.find((item) => item.time === picked.time);
    const heading = document.createElement("h2");
    heading.className = "event-headline";
    heading.textContent = `${picked.ja} ${slot.time}–${slot.end}`;
    detail.append(heading);

    if (slot.booking) {
      const list = document.createElement("dl");
      list.className = "admin-meta";
      const rows = [
        ["区分", sourceLabel[slot.booking.source] || slot.booking.source],
        ["名前", slot.booking.name || "—"],
        ["電話", slot.booking.phone ? formatPhone(slot.booking.phone) : "—"],
        ["メール", slot.booking.email || "—"],
        ["メモ", slot.booking.note || "—"],
        ["受付", formatWhen(slot.booking.createdAt)],
      ];
      if (slot.booking.code) rows.splice(1, 0, ["番号", slot.booking.code]);
      rows.forEach(([label, value]) => {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        if (label === "電話" && slot.booking.phone) {
          const link = document.createElement("a");
          link.className = "text-link";
          link.href = `tel:${slot.booking.phone}`;
          link.textContent = value;
          dd.append(link);
        } else {
          dd.textContent = value;
        }
        row.append(dt, dd);
        list.append(row);
      });
      detail.append(list);
      const release = document.createElement("button");
      release.className = "btn btn--line";
      release.type = "button";
      release.textContent = "この枠を空ける";
      release.addEventListener("click", () => mutate({ action: "release", date: picked.date, time: picked.time }));
      detail.append(release);
      return;
    }

    if (slot.status === "past") {
      const note = document.createElement("p");
      note.className = "reserve-status";
      note.textContent = "この時間は過ぎています。";
      detail.append(note);
      return;
    }

    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 40;
    const phone = document.createElement("input");
    phone.type = "tel";
    const email = document.createElement("input");
    email.type = "email";
    const note = document.createElement("textarea");
    note.maxLength = 400;
    const book = document.createElement("button");
    book.className = "btn btn--solid";
    book.type = "button";
    book.textContent = "電話予約として入れる";
    book.addEventListener("click", () =>
      mutate({
        action: "book",
        date: picked.date,
        time: picked.time,
        name: name.value,
        phone: phone.value,
        email: email.value,
        note: note.value,
      })
    );
    const close = document.createElement("button");
    close.className = "btn btn--line";
    close.type = "button";
    close.textContent = "この枠を閉じる";
    close.addEventListener("click", () =>
      mutate({ action: "close", date: picked.date, time: picked.time, note: note.value })
    );
    const actions = document.createElement("div");
    actions.className = "reserve-actions";
    actions.append(book, close);
    detail.append(
      field("Name", name),
      field("Phone", phone),
      field("Email（任意）", email),
      field("Note（任意）", note),
      actions
    );
  };

  const renderBoard = () => {
    board.replaceChildren();
    warning.hidden = Boolean(state.durable);
    state.days.forEach((day) => {
      const section = document.createElement("section");
      section.className = "slot-day";
      const title = document.createElement("h3");
      title.className = "slot-day__title";
      title.textContent = day.heading;
      const date = document.createElement("p");
      date.className = "slot-day__date";
      date.textContent = day.ja;
      const grid = document.createElement("div");
      grid.className = "slot-grid";
      day.slots.forEach((slot) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "slot";
        if (slot.status === "taken") button.classList.add("is-taken");
        if (slot.status === "closed") button.classList.add("is-closed");
        if (slot.status === "past") button.classList.add("is-past");
        if (picked && picked.date === day.date && picked.time === slot.time) {
          button.classList.add("is-selected");
        }
        const time = document.createElement("span");
        time.className = "slot__time";
        time.textContent = `${slot.time}–${slot.end}`;
        const label = document.createElement("span");
        label.className = "slot__state";
        label.textContent = statusLabel[slot.status] || "—";
        button.append(time, label);
        button.addEventListener("click", () => {
          picked = { date: day.date, time: slot.time, ja: day.ja };
          renderBoard();
          renderDetail();
        });
        grid.append(button);
      });
      section.append(title, date, grid);
      board.append(section);
    });
    renderDetail();
  };

  const load = async () => {
    status.textContent = "読み込み中…";
    const response = await fetch("/api/admin", { headers: authHeaders(), cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.status === 403) {
      password = "";
      sessionStorage.removeItem(storageKey);
      showLogin();
      loginError.textContent = "パスワードが違います。";
      return;
    }
    if (!response.ok) {
      status.textContent = data.message || "読み込めませんでした。";
      return;
    }
    state = data;
    status.textContent = data.ended ? "会の時間は終了しています。" : "";
    renderBoard();
  };

  const mutate = async (body) => {
    status.textContent = "保存中…";
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      status.textContent = data.message || "保存できませんでした。";
      return;
    }
    await load();
    if (!state || !state.ended) status.textContent = "保存しました。";
  };

  login.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";
    password = document.getElementById("admin-password").value;
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      password = "";
      loginError.textContent = data.message || "入れませんでした。";
      return;
    }
    sessionStorage.setItem(storageKey, password);
    login.hidden = true;
    app.hidden = false;
    await load();
  });

  document.getElementById("admin-reload").addEventListener("click", load);
  document.getElementById("admin-logout").addEventListener("click", () => {
    password = "";
    sessionStorage.removeItem(storageKey);
    state = null;
    picked = null;
    showLogin();
  });

  if (password) {
    login.hidden = true;
    app.hidden = false;
    load();
  }
})();
