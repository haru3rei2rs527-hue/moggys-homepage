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
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
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
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
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
  if (!("IntersectionObserver" in window) || reveals.length === 0) {
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
