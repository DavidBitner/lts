(() => {
  "use strict";

  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
  let topbar = null;
  let chipsEl = null;
  let nextBtn = null;
  let barFill = null;
  let groups = [];
  let rafId = 0;
  let errorMode = false;
  let navEl = null;
  let rail = null;
  let railCount = null;
  let railFill = null;
  let railNext = null;
  let mapBtn = null;
  let mapRing = null;
  let mapCount = null;
  let optBtn = null;
  let optsEl = null;
  let backdrop = null;
  let quick = null;
  let contextEl = null;
  let contextMarker = null;
  const MOBILE = window.matchMedia("(max-width: 720px)");

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  function build() {
    const nav = el("nav", "pagemap");
    nav.setAttribute("aria-label", "Mapa da página");
    navEl = nav;

    chipsEl = el("div", "pm-chips");
    groups.forEach((g, i) => {
      const chip = el("button", "pm-chip");
      chip.type = "button";
      chip.dataset.index = String(i);
      chip.appendChild(el("span", "pm-check", "✓"));
      chip.appendChild(el("span", "pm-name", g.label));
      g.segsEl = el("span", "pm-segs");
      chip.appendChild(g.segsEl);
      g.chip = chip;
      g.segCount = -1;
      chipsEl.appendChild(chip);
    });
    nav.appendChild(chipsEl);

    nextBtn = el("button", "pm-next");
    nextBtn.type = "button";
    nav.appendChild(nextBtn);
    topbar.appendChild(nav);

    const bar = el("div", "pm-bar");
    barFill = el("div", "pm-bar-fill");
    bar.appendChild(barFill);
    topbar.appendChild(bar);

    buildRail();
    buildMobileControls();
  }

  function buildMobileControls() {
    mapBtn = el("button", "pm-mapbtn");
    mapBtn.type = "button";
    mapBtn.setAttribute("aria-label", "Abrir mapa da página");
    mapRing = el("span", "pm-ring");
    mapRing.appendChild(el("span", "pm-ring-check", "\u2713"));
    mapBtn.appendChild(mapRing);
    mapCount = el("span", "pm-mapbtn-count");
    mapBtn.appendChild(mapCount);
    topbar.appendChild(mapBtn);

    optsEl = topbar.querySelector(".opts");
    if (optsEl) {
      optBtn = el("button", "pm-optbtn");
      optBtn.type = "button";
      optBtn.setAttribute("aria-label", "Opções");
      optBtn.setAttribute("aria-expanded", "false");
      optBtn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>';
      topbar.appendChild(optBtn);
    }

    backdrop = el("div", "pm-backdrop");
    document.body.appendChild(backdrop);
  }

  function setSheet(open) {
    rail.classList.toggle("is-open", open);
    backdrop.classList.toggle("is-open", open);
    document.body.classList.toggle("pm-sheet-open", open);
  }

  function setOpts(open) {
    if (!optsEl) return;
    optsEl.classList.toggle("is-open", open);
    optBtn.setAttribute("aria-expanded", open ? "true" : "false");
    optBtn.classList.toggle("is-active", open);
  }

  function applyMode() {
    const mobile = MOBILE.matches;
    document.body.classList.toggle("pm-mobile", mobile);
    if (!mobile) {
      setSheet(false);
      setOpts(false);
    }
    if (contextEl && quick) {
      if (mobile && contextEl.parentNode !== quick) {
        if (!contextMarker) contextMarker = document.createComment("pm-context");
        contextEl.parentNode.insertBefore(contextMarker, contextEl);
        quick.appendChild(contextEl);
      } else if (!mobile && contextEl.parentNode === quick && contextMarker) {
        contextMarker.parentNode.insertBefore(contextEl, contextMarker);
      }
    }
    schedule();
  }

  function buildRail() {
    rail = el("aside", "pm-rail");
    rail.setAttribute("aria-label", "Mapa da página");

    const head = el("div", "pm-rail-head");
    head.appendChild(el("span", "pm-rail-title", "Obrigatórios"));
    railCount = el("span", "pm-rail-count");
    head.appendChild(railCount);
    const closeBtn = el("button", "pm-rail-close", "\u2715");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Fechar mapa");
    head.appendChild(closeBtn);
    rail.appendChild(head);

    const track = el("div", "pm-rail-bar");
    railFill = el("div", "pm-rail-fill");
    track.appendChild(railFill);
    rail.appendChild(track);

    contextEl = document.querySelector(".topbar .context");
    if (contextEl) {
      quick = el("div", "pm-rail-quick");
      quick.appendChild(
        el("div", "pm-rail-sub", "Dados rápidos \u00b7 toque para copiar"),
      );
      rail.appendChild(quick);
    }

    const list = el("nav", "pm-rail-list");
    groups.forEach((g, i) => {
      const item = el("button", "pm-rail-item");
      item.type = "button";
      item.dataset.index = String(i);
      const ring = el("span", "pm-ring");
      ring.appendChild(el("span", "pm-ring-check", "\u2713"));
      item.appendChild(ring);
      item.appendChild(el("span", "pm-rail-name", g.label));
      g.railNum = el("span", "pm-rail-num");
      item.appendChild(g.railNum);
      g.railItem = item;
      g.ring = ring;
      list.appendChild(item);
    });
    rail.appendChild(list);

    railNext = el("button", "pm-rail-next");
    railNext.type = "button";
    rail.appendChild(railNext);
    document.body.appendChild(rail);
  }

  function renderSegments(g, items) {
    if (g.segCount !== items.length) {
      g.segsEl.innerHTML = "";
      items.forEach(() => g.segsEl.appendChild(el("span", "pm-seg")));
      g.segCount = items.length;
    }
    Array.from(g.segsEl.children).forEach((seg, i) =>
      seg.classList.toggle("on", !!items[i] && items[i].ok),
    );
  }

  function refresh() {
    if (!topbar || !groups.length) return;
    let totalAll = 0;
    let doneAll = 0;

    groups.forEach((g) => {
      const items = g.items ? g.items() : [];
      g.last = items;
      const done = items.filter((x) => x.ok).length;
      totalAll += items.length;
      doneAll += done;

      const state = !items.length
        ? "optional"
        : done === items.length
          ? "done"
          : done === 0
            ? "empty"
            : "partial";
      ["optional", "done", "empty", "partial"].forEach((s) =>
        g.chip.classList.toggle("is-" + s, s === state),
      );
      renderSegments(g, items);

      ["optional", "done", "empty", "partial"].forEach((s) =>
        g.railItem.classList.toggle("is-" + s, s === state),
      );
      g.ring.style.setProperty(
        "--p",
        items.length ? String((done / items.length) * 100) : "0",
      );
      g.railNum.textContent = items.length ? `${done}/${items.length}` : "";
      g.railItem.title = g.chip.title;

      const missing = items.filter((x) => !x.ok).map((x) => x.label);
      g.chip.title = !items.length
        ? g.label
        : state === "done"
          ? `${g.label}: completo`
          : `${g.label}: faltam ${missing.join(", ")}`;
      g.chip.setAttribute(
        "aria-label",
        items.length
          ? `${g.label}: ${done} de ${items.length} campos obrigatórios`
          : g.label,
      );
    });

    const complete = totalAll > 0 && doneAll === totalAll;
    if (complete) errorMode = false;
    navEl.classList.toggle("has-errors", errorMode);
    nextBtn.classList.toggle("is-complete", complete);
    nextBtn.textContent = "";
    if (complete) {
      nextBtn.appendChild(el("span", "pm-next-count", "✓"));
      nextBtn.appendChild(el("span", "pm-next-label", "Tudo preenchido"));
    } else {
      nextBtn.appendChild(el("span", "pm-next-count", `${doneAll}/${totalAll}`));
      nextBtn.appendChild(el("span", "pm-next-label", "Próximo campo"));
      nextBtn.appendChild(el("span", "pm-next-arrow", "›"));
    }
    nextBtn.title = complete
      ? "Todos os campos obrigatórios estão preenchidos"
      : "Ir para o próximo campo obrigatório pendente";

    rail.classList.toggle("has-errors", errorMode);
    rail.style.top = MOBILE.matches ? "" : `${topbar.offsetHeight + 24}px`;
    mapCount.textContent = `${doneAll}/${totalAll}`;
    mapRing.style.setProperty(
      "--p",
      totalAll ? String((doneAll / totalAll) * 100) : "0",
    );
    mapBtn.classList.toggle("is-complete", complete);
    mapBtn.classList.toggle("has-errors", errorMode);
    railCount.textContent = `${doneAll}/${totalAll}`;
    railFill.style.width = totalAll ? `${(doneAll / totalAll) * 100}%` : "0%";
    railFill.classList.toggle("is-complete", complete);
    railNext.classList.toggle("is-complete", complete);
    railNext.textContent = complete ? "\u2713 Tudo preenchido" : "Próximo campo \u203A";

    barFill.style.width = totalAll ? `${(doneAll / totalAll) * 100}%` : "0%";
    barFill.classList.toggle("is-complete", complete);

    updateCurrent();
  }

  function topOffset() {
    return (topbar ? topbar.offsetHeight : 0) + 12;
  }

  function scrollTo(y) {
    window.scrollTo({
      top: Math.max(0, y),
      behavior: REDUCED_MOTION.matches ? "auto" : "smooth",
    });
  }

  function flash(node) {
    node.classList.remove("pm-flash");
    void node.offsetWidth;
    node.classList.add("pm-flash");
    setTimeout(() => node.classList.remove("pm-flash"), 1600);
  }

  function goToField(field) {
    const anchor = field.closest(".field") || field;
    const rect = anchor.getBoundingClientRect();
    const room = window.innerHeight - topOffset();
    scrollTo(rect.top + window.scrollY - topOffset() - room * 0.3);
    try {
      field.focus({ preventScroll: true });
    } catch (_) {}
    flash(field);
  }

  function goToGroup(g) {
    const next = (g.last || []).find((x) => !x.ok);
    const target = next ? document.getElementById(next.id) : null;
    if (target) return goToField(target);
    scrollTo(g.section.getBoundingClientRect().top + window.scrollY - topOffset());
    flash(g.section);
  }

  function goToNext() {
    const g = groups.find((x) => (x.last || []).some((i) => !i.ok));
    if (g) return goToGroup(g);
    const btn = document.getElementById("generateWord");
    scrollTo(document.documentElement.scrollHeight);
    if (btn) {
      btn.focus({ preventScroll: true });
      flash(btn);
    }
  }

  function updateCurrent() {
    if (!groups.length) return;
    const limit = topOffset() + 80;
    const atBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 4;
    let current = groups[0];
    groups.forEach((g) => {
      if (g.section.getBoundingClientRect().top <= limit) current = g;
    });
    if (atBottom) current = groups[groups.length - 1];

    groups.forEach((g) => {
      g.chip.classList.toggle("is-current", g === current);
      g.railItem.classList.toggle("is-current", g === current);
    });
    const chip = current.chip;
    const left = chip.offsetLeft - chipsEl.offsetLeft;
    if (left < chipsEl.scrollLeft)
      chipsEl.scrollLeft = Math.max(0, left - 8);
    else if (left + chip.offsetWidth > chipsEl.scrollLeft + chipsEl.clientWidth)
      chipsEl.scrollLeft = left + chip.offsetWidth - chipsEl.clientWidth + 8;
  }

  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      refresh();
    });
  }

  function init(options) {
    topbar = document.querySelector(".topbar");
    if (!topbar || !options || !Array.isArray(options.groups)) return;

    groups = options.groups
      .map((g) => {
        const section = document.getElementById(g.section);
        if (!section) return null;
        const heading = section.querySelector("h3");
        const ownText = heading
          ? Array.from(heading.childNodes)
              .filter((n) => n.nodeType === 3)
              .map((n) => n.textContent)
              .join("")
              .trim()
          : "";
        const label = g.label || ownText;
        return { items: g.items, section, label };
      })
      .filter(Boolean);
    if (!groups.length) return;

    build();

    chipsEl.addEventListener("click", (e) => {
      const chip = e.target.closest(".pm-chip");
      if (chip) goToGroup(groups[Number(chip.dataset.index)]);
    });
    nextBtn.addEventListener("click", goToNext);
    rail.addEventListener("click", (e) => {
      if (e.target.closest(".pm-rail-close")) return setSheet(false);
      const item = e.target.closest(".pm-rail-item");
      if (item) {
        setSheet(false);
        return goToGroup(groups[Number(item.dataset.index)]);
      }
      if (e.target.closest(".pm-rail-next")) {
        setSheet(false);
        goToNext();
      }
    });
    mapBtn.addEventListener("click", () => {
      setOpts(false);
      setSheet(!rail.classList.contains("is-open"));
    });
    backdrop.addEventListener("click", () => setSheet(false));
    if (optBtn) {
      optBtn.addEventListener("click", () => {
        setSheet(false);
        setOpts(!optsEl.classList.contains("is-open"));
      });
      document.addEventListener("click", (e) => {
        if (!optsEl.classList.contains("is-open")) return;
        if (e.target.closest(".pm-optbtn")) return;
        if (!e.target.closest(".opts") || e.target.closest("button"))
          setOpts(false);
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      setSheet(false);
      setOpts(false);
    });
    if (MOBILE.addEventListener) MOBILE.addEventListener("change", applyMode);
    else if (MOBILE.addListener) MOBILE.addListener(applyMode);
    applyMode();

    ["input", "change", "focusout", "click"].forEach((type) =>
      document.addEventListener(type, () => setTimeout(schedule, 30), true),
    );
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    setInterval(() => {
      if (!document.hidden) schedule();
    }, 700);

    refresh();
  }

  function showErrors() {
    errorMode = true;
    refresh();
  }

  function clearErrors() {
    errorMode = false;
    refresh();
  }

  window.PageMap = { init, refresh: schedule, showErrors, clearErrors };
})();
