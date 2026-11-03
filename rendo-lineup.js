(() => {
  const root = document.querySelector("[data-lineup]");
  if (!root) return;

  const buttons = [...root.querySelectorAll("[data-filter]")];
  const items = [...document.querySelectorAll("[data-kind]")];
  const status = root.querySelector("[data-lineup-status]");
  const unit = status ? status.getAttribute("data-unit") || "" : "";

  const apply = (kind) => {
    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-filter") === kind));
    });

    let count = 0;
    items.forEach((item) => {
      const show = kind === "all" || item.getAttribute("data-kind") === kind;
      item.hidden = !show;
      if (show && item.classList.contains("lineup-card")) count += 1;
    });

    if (status) {
      const singular = status.getAttribute("data-unit-one");
      status.textContent = count === 1 && singular ? singular : String(count) + unit;
    }
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      apply(button.getAttribute("data-filter"));
    });
  });

  const revealHashed = () => {
    const id = location.hash.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (target && target.hidden) apply("all");
  };

  window.addEventListener("hashchange", revealHashed);
})();
