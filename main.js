/* 会の案内を期限で隠す。来年は HTML の data-expire と日付の文言を揃えて変える。 */
(() => {
  const now = Date.now();
  document.querySelectorAll("[data-expire]").forEach((el) => {
    const expire = Date.parse(el.getAttribute("data-expire") || "");
    if (!Number.isNaN(expire) && now >= expire) el.hidden = true;
  });
})();

(() => {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");

  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (toggle && nav) {
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "nav-backdrop";
    backdrop.hidden = true;
    backdrop.setAttribute(
      "aria-label",
      document.documentElement.lang === "en" ? "Close menu" : "メニューを閉じる"
    );
    document.body.append(backdrop);

    const closeNav = () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      backdrop.hidden = true;
    };

    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      backdrop.hidden = !open;
    });

    backdrop.addEventListener("click", closeNav);

    if (header) {
      header.addEventListener("click", (event) => {
        if (!nav.classList.contains("is-open")) return;
        if (nav.contains(event.target) || toggle.contains(event.target)) return;
        closeNav();
      });
    }

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeNav);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !nav.classList.contains("is-open")) return;
      closeNav();
      toggle.focus();
    });
  }

  const jump = document.querySelector(".collection-jump");
  const jumpSentinel = document.querySelector(".collection-jump-sentinel");
  if (jump) {
    const jumpOffset = () => {
      const headerH = header ? header.offsetHeight : 72;
      return headerH + jump.offsetHeight + 12;
    };

    const scrollToId = (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const reveal = el.closest(".reveal");
      if (reveal) reveal.classList.add("is-visible");
      const top = el.getBoundingClientRect().top + window.scrollY - jumpOffset();
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: reduceMotion ? "auto" : "smooth",
      });
    };

    jump.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const id = link.getAttribute("href").slice(1);
        if (!id || !document.getElementById(id)) return;
        event.preventDefault();
        scrollToId(id);
        history.pushState(null, "", "#" + id);
      });
    });

    const syncJumpCurrent = () => {
      const usedEl = document.getElementById("used");
      const usedLink = jump.querySelector('a[href="#used"]');
      const rendoLink = jump.querySelector('a[href="#rendo"]');
      if (!usedEl || !usedLink || !rendoLink) return;
      const onUsed = usedEl.getBoundingClientRect().top <= jumpOffset() + 8;
      usedLink.setAttribute("aria-current", onUsed ? "location" : "false");
      rendoLink.setAttribute("aria-current", onUsed ? "false" : "location");
    };

    window.addEventListener("scroll", syncJumpCurrent, { passive: true });
    syncJumpCurrent();

    if (jumpSentinel && "IntersectionObserver" in window) {
      const headerH = () => (header ? header.offsetHeight : 72);
      const stuckIo = new IntersectionObserver(
        ([entry]) => {
          jump.classList.toggle("is-stuck", Boolean(entry) && !entry.isIntersecting);
        },
        { threshold: 0, rootMargin: `-${headerH()}px 0px 0px 0px` }
      );
      stuckIo.observe(jumpSentinel);
    }

    if (location.hash.length > 1) {
      requestAnimationFrame(() => scrollToId(location.hash.slice(1)));
    }
  }

  const reveals = document.querySelectorAll(".reveal");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window) || reveals.length === 0) {
    reveals.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18, rootMargin: "0px 0px -40px 0px" }
  );

  reveals.forEach((el) => io.observe(el));
})();

(() => {
  const enPage = document.documentElement.lang === "en";
  document.querySelectorAll(".rendo-gallery--lineup").forEach((gallery) => {
    const scroller = gallery.querySelector(".rendo-gallery__scroller");
    const dots = gallery.querySelector(".rendo-gallery__dots");
    const prev = gallery.querySelector(".rendo-gallery__prev");
    const next = gallery.querySelector(".rendo-gallery__next");
    if (!scroller || !dots || !prev || !next) return;
    const slides = [...scroller.querySelectorAll(":scope > figure")];

    const nearest = () => {
      const origin = scroller.getBoundingClientRect().left;
      let index = 0;
      let best = Infinity;
      slides.forEach((slide, item) => {
        const distance = Math.abs(slide.getBoundingClientRect().left - origin);
        if (distance < best) {
          best = distance;
          index = item;
        }
      });
      return index;
    };

    const buttons = slides.map((_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", enPage ? `Shoe ${index + 1}` : `${index + 1}足目`);
      button.addEventListener("click", () => {
        slides[index].scrollIntoView({ inline: "start", block: "nearest" });
      });
      dots.append(button);
      return button;
    });

    const showDots = (index) => {
      const count = buttons.length;
      const apply = (size) => {
        const half = Math.floor((size - 1) / 2);
        let start = index - half;
        let end = start + size - 1;
        if (start < 0) {
          end = Math.min(count - 1, end - start);
          start = 0;
        }
        if (end > count - 1) {
          start = Math.max(0, start - (end - (count - 1)));
          end = count - 1;
        }
        buttons.forEach((button, item) => {
          button.hidden = item < start || item > end;
        });
      };
      apply(count);
      if (!dots.clientWidth || dots.scrollWidth <= dots.clientWidth) return;
      let low = 1;
      let high = count - 1;
      let best = 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        apply(mid);
        if (dots.scrollWidth <= dots.clientWidth) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      apply(best);
    };

    const paint = () => {
      const index = nearest();
      buttons.forEach((button, item) => {
        const current = item === index;
        button.classList.toggle("is-current", current);
        button.setAttribute("aria-current", current ? "true" : "false");
      });
      showDots(index);
      prev.disabled = index === 0;
      next.disabled = index === slides.length - 1;
    };

    const move = (direction) => {
      const slide = slides[0];
      if (!slide) return;
      const styles = getComputedStyle(scroller);
      const gap = parseFloat(styles.columnGap || styles.gap) || 0;
      scroller.scrollBy({ left: direction * (slide.getBoundingClientRect().width + gap) });
    };

    scroller.addEventListener("scroll", paint, { passive: true });
    prev.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    if (typeof ResizeObserver === "function") new ResizeObserver(() => paint()).observe(dots);
    paint();
  });
})();
