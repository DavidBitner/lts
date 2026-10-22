/* ========================================================================== */
/* Accident Report App - Final Version                                        */
/* ========================================================================== */

(() => {
  "use strict";

  /* ========================================================================== */
  /* Config & State                                                             */
  /* ========================================================================== */
  const APP_NS = "acidentes:";
  const YEAR_SUFFIX = "2026";
  const MAX_DOC_WIDTH = 680;
  const MAX_DOC_HEIGHT = 780;
  const PAIR_MAX_HEIGHT = 380;
  const CAPTION_MAX_LENGTH = 120;

  let attachedImages = [];
  let imageDimensionsCache = {};
  let currentDocBlob = null;
  let currentFileName = "";

  /* ========================================================================== */
  /* DOM Utilities                                                              */
  /* ========================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);
  const trackEvent = (type) => {
    try {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "acidentes", type }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  };
  const nonEmpty = (v) => v != null && String(v).trim() !== "";

  const setText = (id, text) => {
    const el = byId(id);
    if (el) el.textContent = text;
  };

  /* ========================================================================== */
  /* UI: Alerts & Modals                                                        */
  /* ========================================================================== */
  const ui = {
    alert: (title, message) => {
      const titleEl = byId("sys-title");
      const msgEl = byId("sys-msg");
      const actions = byId("sys-actions");
      const modal = byId("modal-system");

      if (titleEl) titleEl.innerText = title;
      if (msgEl) msgEl.innerHTML = message.replace(/\n/g, "<br>");

      if (actions) {
        actions.innerHTML = "";
        const btn = document.createElement("button");
        btn.className = "button";
        btn.innerHTML = `<span class="shadow"></span><span class="edge"></span><div class="front"><span>OK</span></div>`;
        btn.onclick = () => modal.classList.remove("show");
        actions.appendChild(btn);
      }
      if (modal) modal.classList.add("show");
    },

    confirm: (title, message, onConfirm) => {
      const titleEl = byId("sys-title");
      const msgEl = byId("sys-msg");
      const actions = byId("sys-actions");
      const modal = byId("modal-system");

      if (titleEl) titleEl.innerText = title;
      if (msgEl) msgEl.innerHTML = message.replace(/\n/g, "<br>");

      if (actions) {
        actions.innerHTML = "";
        const btnCancel = document.createElement("button");
        btnCancel.className = "button";
        btnCancel.style.flex = "1";
        btnCancel.innerHTML = `<span class="shadow"></span><span class="edge"></span><div class="front" style="background:#777"><span>NÃO</span></div>`;
        btnCancel.onclick = () => modal.classList.remove("show");

        const btnConfirm = document.createElement("button");
        btnConfirm.className = "button";
        btnConfirm.style.flex = "1";
        btnConfirm.innerHTML = `<span class="shadow"></span><span class="edge"></span><div class="front"><span>SIM</span></div>`;
        btnConfirm.onclick = () => {
          modal.classList.remove("show");
          if (onConfirm) onConfirm();
        };

        actions.appendChild(btnCancel);
        actions.appendChild(btnConfirm);
      }
      if (modal) modal.classList.add("show");
    },
  };

  /* ========================================================================== */
  /* Storage (LocalStorage)                                                     */
  /* ========================================================================== */
  const store = {
    get(key) {
      return window.localStorage.getItem(APP_NS + key);
    },
    set(key, v) {
      window.localStorage.setItem(APP_NS + key, v);
    },
    clearAll() {
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(APP_NS)) window.localStorage.removeItem(k);
      }
    },
  };

  /* ========================================================================== */
  /* Image Processing                                                           */
  /* ========================================================================== */
  function base64DataURLToArrayBuffer(dataURL) {
    const base64Regex = /^data:image\/\w+;base64,/;
    if (!dataURL || !base64Regex.test(dataURL)) return null;
    const stringBase64 = dataURL.replace(base64Regex, "");
    const binaryString = window.atob(stringBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes.buffer;
  }

  function addImage(base64, width, height) {
    if (imageDimensionsCache[base64]) return;
    attachedImages.push({ src: base64, w: width, h: height, caption: "" });
    imageDimensionsCache[base64] = { w: width, h: height };
    renderGallery();
  }

  function processImageFile(blob) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64 = evt.target.result;
      const imgTemp = new Image();
      imgTemp.onload = () =>
        addImage(base64, imgTemp.naturalWidth, imgTemp.naturalHeight);
      imgTemp.src = base64;
    };
    reader.readAsDataURL(blob);
  }

  function isLandscape(item) {
    return item.w >= item.h;
  }

  function computeImageSizes() {
    const sizes = new Map();
    const fit = (item, maxH) => {
      let w = Math.min(item.w, MAX_DOC_WIDTH);
      let h = item.h * (w / item.w);
      if (h > maxH) {
        w *= maxH / h;
        h = maxH;
      }
      return [Math.round(w), Math.round(h)];
    };
    const pairedWithNext = new Set();
    for (let i = 0; i < attachedImages.length - 1; i++) {
      if (
        isLandscape(attachedImages[i]) &&
        isLandscape(attachedImages[i + 1])
      ) {
        pairedWithNext.add(i);
        i++;
      }
    }
    attachedImages.forEach((item, i) => {
      const paired =
        pairedWithNext.has(i) || (i > 0 && pairedWithNext.has(i - 1));
      sizes.set(item.src, fit(item, paired ? PAIR_MAX_HEIGHT : MAX_DOC_HEIGHT));
    });
    return { sizes, pairedWithNext };
  }

  function moveImage(from, to) {
    if (to < 0 || to >= attachedImages.length || from === to) return;
    const [item] = attachedImages.splice(from, 1);
    attachedImages.splice(to, 0, item);
    renderGallery();
  }

  function getGalleryContainer() {
    let gallery = byId("image-gallery");
    if (!gallery) {
      const area = byId("paste-area");
      if (!area) return null;
      gallery = document.createElement("div");
      gallery.id = "image-gallery";
      gallery.className = "image-gallery";
      area.insertAdjacentElement("afterend", gallery);
    }
    return gallery;
  }

  function renderGallery() {
    const container = getGalleryContainer();
    if (!container) return;
    container.innerHTML = "";
    container.hidden = attachedImages.length === 0;
    if (attachedImages.length === 0) return;

    let dragIndex = null;

    attachedImages.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "image-card";
      card.draggable = true;

      const thumb = document.createElement("div");
      thumb.className = "image-card-thumb";
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = "";
      img.draggable = false;
      thumb.appendChild(img);

      const caption = document.createElement("input");
      caption.type = "text";
      caption.className = "image-card-caption";
      caption.placeholder = "Legenda (opcional)";
      caption.maxLength = CAPTION_MAX_LENGTH;
      caption.value = item.caption || "";
      caption.addEventListener("input", () => {
        item.caption = caption.value;
      });
      caption.addEventListener("blur", () => {
        caption.value = caption.value.toUpperCase();
        item.caption = caption.value;
      });
      caption.addEventListener("dragstart", (e) => e.stopPropagation());

      const actions = document.createElement("div");
      actions.className = "image-card-actions";
      const mkBtn = (label, title, handler, disabled) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.title = title;
        b.disabled = !!disabled;
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          handler();
        });
        return b;
      };
      actions.appendChild(
        mkBtn(
          "‹",
          "Mover para trás",
          () => moveImage(index, index - 1),
          index === 0,
        ),
      );
      actions.appendChild(
        mkBtn(
          "›",
          "Mover para frente",
          () => moveImage(index, index + 1),
          index === attachedImages.length - 1,
        ),
      );
      const hasCaptionField = Boolean(item.caption) || item.captionOpen;
      actions.appendChild(
        mkBtn(
          hasCaptionField ? "Sem legenda" : "Legenda",
          hasCaptionField ? "Remover legenda" : "Adicionar legenda",
          () => {
            if (hasCaptionField) {
              item.caption = "";
              item.captionOpen = false;
            } else {
              item.captionOpen = true;
            }
            renderGallery();
            if (item.captionOpen) {
              const field = container.querySelectorAll(".image-card-caption")[
                index
              ];
              if (field) field.focus();
            }
          },
        ),
      );
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "image-card-remove";
      remove.textContent = "✕";
      remove.title = "Remover imagem";
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        delete imageDimensionsCache[item.src];
        attachedImages.splice(index, 1);
        renderGallery();
      });
      thumb.appendChild(remove);

      card.addEventListener("dragstart", (e) => {
        dragIndex = index;
        card.classList.add("dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(index));
        }
      });
      const clearMarkers = () =>
        container
          .querySelectorAll(".drop-before, .drop-after")
          .forEach((el) => el.classList.remove("drop-before", "drop-after"));
      card.addEventListener("dragend", () => {
        dragIndex = null;
        card.classList.remove("dragging");
        clearMarkers();
      });
      card.addEventListener("dragover", (e) => {
        if (dragIndex === null) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = card.getBoundingClientRect();
        const after = e.clientX > rect.left + rect.width / 2;
        clearMarkers();
        card.classList.add(after ? "drop-after" : "drop-before");
        card.dataset.dropIndex = String(index + (after ? 1 : 0));
      });
      card.addEventListener("dragleave", (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.classList.remove("drop-before", "drop-after");
        }
      });
      card.addEventListener("drop", (e) => {
        if (dragIndex === null) return;
        e.preventDefault();
        e.stopPropagation();
        const from = dragIndex;
        let target = Number(card.dataset.dropIndex ?? index);
        dragIndex = null;
        clearMarkers();
        if (from < target) target--;
        moveImage(from, target);
      });

      card.appendChild(thumb);
      if (hasCaptionField) card.appendChild(caption);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  /* ========================================================================== */
  /* Clipboard & DragAndDrop                                                    */
  /* ========================================================================== */
  async function handlePasteFromClipboard() {
    const container = byId("paste-area");
    const textP = container.querySelector("p");
    const originalText = textP.innerHTML;
    try {
      container.classList.add("loading");
      textP.innerHTML = "Lendo área de transferência...";
      const clipboardItems = await navigator.clipboard.read();
      let found = false;
      for (const item of clipboardItems) {
        const imageTypes = item.types.filter((type) =>
          type.startsWith("image/"),
        );
        for (const type of imageTypes) {
          const blob = await item.getType(type);
          processImageFile(blob);
          found = true;
        }
      }
      if (!found)
        ui.alert(
          "Aviso",
          "Nenhuma imagem encontrada na área de transferência.",
        );
    } catch (err) {
      console.error("Clipboard error:", err);
    } finally {
      container.classList.remove("loading");
      textP.innerHTML = originalText;
    }
  }

  function wireDragAndDrop(area) {
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      area.addEventListener(
        eventName,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        false,
      );
    });
    ["dragenter", "dragover"].forEach((eventName) => {
      area.addEventListener(
        eventName,
        () => area.classList.add("dragging"),
        false,
      );
    });
    ["dragleave", "drop"].forEach((eventName) => {
      area.addEventListener(
        eventName,
        () => area.classList.remove("dragging"),
        false,
      );
    });
    area.addEventListener(
      "drop",
      (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith("image/")) processImageFile(files[i]);
          }
        }
      },
      false,
    );
  }

  /* ========================================================================== */
  /* Polyfills & Helpers                                                        */
  /* ========================================================================== */
  if (
    typeof SVGElement !== "undefined" &&
    !SVGElement.prototype.hasOwnProperty("namespaceURI")
  ) {
    Object.defineProperty(SVGElement.prototype, "namespaceURI", {
      get: () => "http://www.w3.org/2000/svg",
      set: () => {},
    });
  }

  function formatPtBrDate(ymd) {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-");
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
  }

  function getYearSuffix(ymd) {
    return ymd ? ymd.split("-")[0] : "2026";
  }

  function extractCoordinates(text) {
    const regex = /-?\d+\.\d+/g;
    const matches = text.match(regex);
    if (!matches || matches.length < 2) return null;
    let lat = parseFloat(matches[0]);
    let lng = parseFloat(matches[1]);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      if (matches[1] >= -90 && matches[1] <= 90) {
        lat = parseFloat(matches[1]);
        lng = parseFloat(matches[0]);
      } else return null;
    }
    return { lat, lng };
  }

  /* ========================================================================== */
  /* People (Motoristas, Vítimas, Terceiros, Testemunhas)                       */
  /* ========================================================================== */
  const NO_DATA = "NÃO HOUVE";
  const PEOPLE_KEY = "people";
  const PEOPLE = {
    driver: {
      title: "Motorista",
      list: "drivers",
      required: true,
      fields: [
        ["Name", "Nome"],
        ["Cpf", "CPF"],
        ["Situation", "Situação"],
      ],
    },
    victim: {
      title: "Vítima",
      list: "victims",
      fields: [
        ["Name", "Nome"],
        ["Documentation", "Documentação"],
        ["Situation", "Situação"],
        ["Contact", "Contato"],
      ],
    },
    thirdParty: {
      title: "Terceiro",
      list: "thirdParties",
      fields: [
        ["Name", "Nome"],
        ["Documentation", "Documentação"],
        ["Contact", "Contato"],
      ],
    },
    witness: {
      title: "Testemunha",
      list: "witnesses",
      fields: [
        ["Name", "Nome"],
        ["Documentation", "Documentação"],
        ["Contact", "Contato"],
        ["Email", "Email"],
      ],
    },
  };

  const people = {};

  const blankPerson = (kind) =>
    Object.fromEntries(PEOPLE[kind].fields.map(([key]) => [key, ""]));

  function savePeople() {
    store.set(PEOPLE_KEY, JSON.stringify(people));
  }

  function loadPeople() {
    let saved = null;
    try {
      saved = JSON.parse(store.get(PEOPLE_KEY));
    } catch (e) {}

    Object.keys(PEOPLE).forEach((kind) => {
      let list = saved && Array.isArray(saved[kind]) ? saved[kind] : [];
      if (list.length === 0) {
        const legacy = blankPerson(kind);
        PEOPLE[kind].fields.forEach(([key]) => {
          const v = store.get(kind + key);
          if (v) legacy[key] = v;
        });
        list = [legacy];
      }
      people[kind] = list;
    });
  }

  function resetPeople() {
    Object.keys(PEOPLE).forEach((kind) => {
      people[kind] = [blankPerson(kind)];
    });
    renderAllPeople();
    refreshBoxes();
  }

  function renderPeople(kind) {
    const cfg = PEOPLE[kind];
    const box = byId("people-" + kind);
    if (!box) return;
    box.innerHTML = "";

    const list = people[kind];
    box.classList.toggle("is-multi", list.length > 1);
    list.forEach((person, idx) => {
      const entry = document.createElement("div");
      entry.className = "person-entry";

      if (list.length > 1) {
        const head = document.createElement("div");
        head.className = "person-head";
        const title = document.createElement("h5");
        title.textContent = `${cfg.title} ${idx + 1}`;
        head.appendChild(title);

        const btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className = "person-remove";
        btnRemove.textContent = "Remover";
        btnRemove.addEventListener("click", () => {
          list.splice(idx, 1);
          savePeople();
          renderPeople(kind);
          refreshBoxes();
        });
        head.appendChild(btnRemove);
        entry.appendChild(head);
      }

      const fields = document.createElement("div");
      fields.className = "person-fields";

      cfg.fields.forEach(([key, label]) => {
        const inputId = `person-${kind}-${idx}-${key}`;
        const wrap = document.createElement("div");
        wrap.className = key === "Name" ? "field field-name" : "field";
        const lab = document.createElement("label");
        lab.htmlFor = inputId;
        lab.textContent = label + ":";

        const input = document.createElement("input");
        input.id = inputId;
        input.type = key === "Email" ? "email" : "text";
        input.placeholder = NO_DATA;
        input.value = person[key] || "";
        input.addEventListener("input", () => {
          person[key] = input.value.trim();
          savePeople();
          refreshBoxes();
        });

        wrap.appendChild(lab);
        wrap.appendChild(input);
        fields.appendChild(wrap);
      });

      entry.appendChild(fields);
      box.appendChild(entry);
    });
  }

  function renderAllPeople() {
    Object.keys(PEOPLE).forEach(renderPeople);
  }

  function wirePeople() {
    loadPeople();
    renderAllPeople();
    $$("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.dataset.add;
        people[kind].push(blankPerson(kind));
        savePeople();
        renderPeople(kind);
        const entries = $$(`#people-${kind} .person-entry`);
        entries[entries.length - 1]?.querySelector("input")?.focus();
      });
    });
  }

  const personLabel = (kind, idx) =>
    people[kind].length > 1
      ? `${PEOPLE[kind].title} ${idx + 1}`
      : PEOPLE[kind].title;

  function collectPeople() {
    const result = {};
    const errors = [];
    for (const kind of Object.keys(PEOPLE)) {
      const cfg = PEOPLE[kind];
      const filled = [];

      people[kind].forEach((person, idx) => {
        const values = {};
        cfg.fields.forEach(([key]) => {
          values[key] = (person[key] || "").toUpperCase().trim();
        });
        if (Object.values(values).some(nonEmpty)) filled.push({ idx, values });
      });

      if (cfg.required) {
        if (filled.length === 0) {
          errors.push({
            label: cfg.title,
            id: `person-${kind}-0-${cfg.fields[0][0]}`,
          });
        }
        for (const { idx, values } of filled) {
          for (const [key, label] of cfg.fields) {
            if (!nonEmpty(values[key])) {
              errors.push({
                label: `${label} do ${personLabel(kind, idx)}`,
                id: `person-${kind}-${idx}-${key}`,
              });
            }
          }
        }
      }

      const rows = filled.length
        ? filled.map((f) => f.values)
        : [blankPerson(kind)];
      result[kind] = rows.map((values, i) => ({
        ...Object.fromEntries(
          cfg.fields.map(([key]) => [kind + key, values[key] || NO_DATA]),
        ),
        [kind + "Num"]: rows.length > 1 ? ` ${i + 1}` : "",
      }));
    }
    return { errors, data: result };
  }

  function reportMissing(items) {
    items.forEach(({ id }) => {
      const el = byId(id);
      if (!el) return;
      el.classList.add("invalid");
      el.classList.remove("valid");
      el.addEventListener("input", () => el.classList.remove("invalid"), {
        once: true,
      });
    });

    const list = items.map((item) => `• <strong>${item.label}</strong>`);
    ui.alert(
      "Campos Obrigatórios",
      `Preencha os campos abaixo:\n\n${list.join("\n")}`,
    );

    const first = byId(items[0].id);
    if (first) {
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      first.focus({ preventScroll: true });
    }
  }

  /* ========================================================================== */
  /* Persistence & Validation                                                   */
  /* ========================================================================== */
  function restoreField(el) {
    if (!el.id) return;
    const val = store.get(el.id);
    if (val !== null)
      el.type === "checkbox" || el.type === "radio"
        ? (el.checked = val === "true")
        : (el.value = val);
  }

  function persistField(el) {
    if (el.id)
      store.set(
        el.id,
        el.type === "checkbox" || el.type === "radio"
          ? String(el.checked)
          : el.value.trim(),
      );
  }

  function wirePersistence() {
    $$("input[id], textarea[id], select[id]").forEach((el) => {
      restoreField(el);
      el.addEventListener("input", () => persistField(el));
      el.addEventListener("change", () => persistField(el));
    });
  }

  const validators = {
    nOc: (el) =>
      setValidity(
        el,
        /^6A\d{4}$/.test(el.value.toUpperCase()),
        byId("nOcError"),
      ),
    coletivo: (el) =>
      setValidity(
        el,
        /^\d{5}( X \d{5})?$/.test(el.value.toUpperCase()),
        byId("coletivoError"),
      ),
    linha: (el) =>
      setValidity(
        el,
        /^[A-Za-z0-9]{4}-[A-Za-z0-9]{2}$/.test(el.value),
        byId("linhaError"),
      ),
    time: (el) =>
      setValidity(el, TIME_PATTERN.test(el.value), byId("timeError")),
    numero: (el) =>
      setValidity(el, /^(\d+|-)$/.test(el.value), byId("numeroError")),
    generic: (el, errId) => setValidity(el, nonEmpty(el.value), byId(errId)),
  };

  function setValidity(el, isValid, errorEl) {
    if (!el) return;
    el.classList.toggle("invalid", !isValid);
    el.classList.toggle("valid", isValid);
    if (errorEl) errorEl.style.display = isValid ? "none" : "inline";
  }

  const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

  function formatTimeInput(raw) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2
      ? `${digits.slice(0, 2)}:${digits.slice(2)}`
      : digits;
  }

  function wireTimeInputs(ids) {
    ids.forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener("input", () => {
        el.value = formatTimeInput(el.value);
      });
      el.addEventListener("blur", () => {
        if (!el.value) {
          el.classList.remove("invalid", "valid");
          return;
        }
        const ok = TIME_PATTERN.test(el.value);
        el.classList.toggle("invalid", !ok);
        el.classList.toggle("valid", ok);
      });
    });
  }

  function parseBrDate(text) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((text || "").trim());
    if (!m) return "";
    const [, dd, mm, yyyy] = m;
    const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    const valid =
      dt.getFullYear() === Number(yyyy) &&
      dt.getMonth() === Number(mm) - 1 &&
      dt.getDate() === Number(dd);
    return valid ? `${yyyy}-${mm}-${dd}` : "";
  }

  function getDateIso() {
    return parseBrDate(byId("date")?.value);
  }

  function formatDateInput(raw) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length > 4)
      return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  }

  function wireDateInput() {
    const el = byId("date");
    if (!el) return;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(el.value);
    if (iso) el.value = `${iso[3]}/${iso[2]}/${iso[1]}`;
    el.addEventListener("input", () => {
      el.value = formatDateInput(el.value);
    });
  }

  function wireValidators() {
    const dateEl = byId("date");
    if (dateEl)
      dateEl.addEventListener("blur", () =>
        setValidity(dateEl, !!parseBrDate(dateEl.value), byId("dateError")),
      );
    const map = {
      nOc: "nOc",
      coletivo: "coletivo",
      linha: "linha",
      time: "time",
      numero: "numero",
    };
    Object.entries(map).forEach(([id, type]) => {
      const el = byId(id);
      if (el)
        el.addEventListener("blur", () => {
          el.value = el.value.toUpperCase();
          validators[type](el);
        });
    });
    ["ocorrencia", "logradouro", "bairro", "cco", "matricula"].forEach((id) => {
      const el = byId(id);
      if (el)
        el.addEventListener("blur", () => {
          el.value = el.value.toUpperCase();
          validators.generic(el, id + "Error");
        });
    });
  }

  function refreshBoxes() {
    const boxLabels = { "box-nOc": "Nº OC" };
    const setBox = (id, value) => {
      const out = byId(id);
      if (out)
        out.innerHTML = `<span class="label">${boxLabels[id] || id.replace("box-", "")}:</span> ${escapeHtml(value)}`;
    };
    const joinDrivers = (key) =>
      (people.driver || [])
        .map((p) => p[key])
        .filter(nonEmpty)
        .join(" / ");

    setBox("box-nOc", byId("nOc")?.value || "");
    setBox("box-coletivo", byId("coletivo")?.value || "");
    setBox("box-logradouro", byId("logradouro")?.value || "");
    setBox("box-condutor", joinDrivers("Name"));
    setBox("box-cpf", joinDrivers("Cpf"));
  }

  function wireBoxes() {
    ["nOc", "coletivo", "logradouro"].forEach((id) =>
      byId(id)?.addEventListener("input", refreshBoxes),
    );
    refreshBoxes();
  }

  async function loadTemplate() {
    const res = await fetch("template.docx");
    if (!res.ok) throw new Error("Failed to load template");
    return res.arrayBuffer();
  }

  function clearAll() {
    store.clearAll();
    $$("input, textarea, select").forEach((el) => {
      if (el.type === "checkbox") el.checked = false;
      else el.value = "";
    });
    attachedImages = [];
    imageDimensionsCache = {};
    renderGallery();
    resetPeople();
    byId("excel")?.classList.add("hidden");
  }

  /* ========================================================================== */
  /* Document Generation (Word/PDF)                                             */
  /* ========================================================================== */
  async function prepareDocument() {
    try {
      const getVal = (id) => (byId(id)?.value || "").toUpperCase().trim();
      const inputs = {
        nOc: getVal("nOc"),
        ocorrencia: getVal("ocorrencia"),
        coletivo: getVal("coletivo"),
        linha: getVal("linha"),
        dateRaw: getDateIso(),
        time: getVal("time"),
        logradouro: getVal("logradouro"),
        numero: getVal("numero"),
        bairro: getVal("bairro"),
        inicioFato: getVal("inicioFato"),
        desfecho: getVal("desfecho"),
        cco: getVal("cco"),
        matricula: getVal("matricula"),
      };

      const extras = [
        "prat",
        "pmvt",
        "pmvtr",
        "bombeirosSamu",
        "sptrans",
        "cet",
        "policiaCivil",
        "gcm",
        "bo",
        "responsavelBo",
        "pericia",
        "ocSptrans",
        "alerta",
        "operacional",
        "matriculaOp",
        "moto",
      ];
      const extraData = {};
      extras.forEach((f) => (extraData[f] = getVal(f) || "NÃO HOUVE"));

      const collected = collectPeople();
      const peopleData = collected.data;
      const missing = [];
      const requireField = (id, label, value) => {
        if (!nonEmpty(value)) missing.push({ id, label });
      };

      requireField("nOc", "Número da OC", inputs.nOc);
      requireField("ocorrencia", "Ocorrência", inputs.ocorrencia);
      requireField("coletivo", "Coletivo", inputs.coletivo);
      requireField("linha", "Linha", inputs.linha);
      requireField("date", "Data", inputs.dateRaw);
      requireField(
        "time",
        "Hora",
        TIME_PATTERN.test(inputs.time) ? inputs.time : "",
      );
      requireField("logradouro", "Endereço", inputs.logradouro);
      requireField("numero", "Número", inputs.numero);
      requireField("bairro", "Bairro", inputs.bairro);
      missing.push(...collected.errors);
      requireField("inicioFato", "Início do Fato", inputs.inicioFato);
      requireField("desfecho", "Desfecho", inputs.desfecho);
      requireField("cco", "CCO", inputs.cco);
      requireField("matricula", "Matrícula", inputs.matricula);

      if (missing.length > 0) {
        reportMissing(missing);
        return;
      }

      const dateFmt = formatPtBrDate(inputs.dateRaw);
      const year = getYearSuffix(inputs.dateRaw);

      const imageSizes = computeImageSizes().sizes;
      const imageOpts = {
        centered: false,
        getImage: (tagValue) =>
          base64DataURLToArrayBuffer(tagValue) || new ArrayBuffer(0),
        getSize: function (img, tagValue) {
          return imageSizes.get(tagValue) || [500, 300];
        },
      };

      let imageModule = null;
      if (window.ImageModule) imageModule = new window.ImageModule(imageOpts);

      const content = await loadTemplate();
      const zip = new PizZip(content);
      const doc = new docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        modules: imageModule ? [imageModule] : [],
      });

      const fotosData = attachedImages.map((img) => {
        const legenda = (img.caption || "").trim().toUpperCase();
        return { imagem: img.src, legenda, temLegenda: legenda.length > 0 };
      });
      const joinField = (kind, key) =>
        peopleData[kind].map((p) => p[kind + key]).join(" / ");

      doc.setData({
        ...inputs,
        ...extraData,
        drivers: peopleData.driver,
        victims: peopleData.victim,
        thirdParties: peopleData.thirdParty,
        witnesses: peopleData.witness,
        nOc: `${inputs.nOc}/${year}`,
        date: dateFmt,
        fotos: fotosData,
      });

      doc.render();

      currentDocBlob = doc.getZip().generate({
        type: "blob",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      currentFileName = `${inputs.nOc} - ${dateFmt.replace(/\//g, ".").slice(0, 5)} - ${inputs.linha} - ${inputs.coletivo} - ${inputs.ocorrencia} - ${inputs.logradouro}`;

      setText("td-nOc", `${inputs.nOc}/${year}`);
      setText("td-date", dateFmt);
      setText("td-alerta", extraData.alerta);
      setText("td-victimName", joinField("victim", "Name"));
      setText("td-driverName", joinField("driver", "Name"));
      setText("td-driverCpf", joinField("driver", "Cpf"));
      setText("td-coletivo", inputs.coletivo);
      setText("td-linha", inputs.linha);
      setText("td-ocorrencia", inputs.ocorrencia);
      setText("td-logradouro", inputs.logradouro);
      setText("td-operacional", extraData.operacional);
      setText("td-bo", extraData.bo);
      setText("td-ocSptrans", extraData.ocSptrans);
      setText("td-sptrans", extraData.sptrans);
      setText("td-time", inputs.time);
      setText("td-cco", inputs.cco);
      setText("td-fechamento", inputs.cco);

      byId("excel")?.classList.remove("hidden");
      byId("modal-format").classList.add("show");
    } catch (err) {
      console.error(err);
      ui.alert(
        "Erro na Geração",
        err.properties?.errors?.map((e) => e.message).join("\n") || err.message,
      );
    }
  }

  function downloadBlob(blob, name) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
  }

  async function generateAndDownloadPDF() {
    const msg = byId("pdf-loading-msg");
    if (msg) msg.style.display = "block";
    try {
      const response = await fetch("/api/convert-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: currentDocBlob,
      });
      if (!response.ok)
        throw new Error(`Status ${response.status}: ${response.statusText}`);
      const pdfBlob = await response.blob();
      downloadBlob(pdfBlob, currentFileName + ".pdf");
    } catch (e) {
      ui.alert("Erro PDF", e.message);
    } finally {
      if (msg) msg.style.display = "none";
      byId("modal-format").classList.remove("show");
    }
  }

  /* ========================================================================== */
  /* Text Review (Gemini)                                                       */
  /* ========================================================================== */
  const FIELD_LABELS = {
    inicioFato: "Início do Fato",
    desfecho: "Desfecho",
  };

  const REVIEW_FIELDS = ["inicioFato", "desfecho"];

  let reviewChanges = [];
  let reviewSpans = [];
  let reviewTexts = {};
  let reviewCooldownInterval = null;

  const REVIEW_COOLDOWN_SECONDS = 60;
  const REVIEW_COOLDOWN_KEY = "lts:reviewCooldownUntil";

  function runReviewCooldownUntil(until) {
    const btn = byId("btn-review-textos");
    if (!btn) return;

    if (reviewCooldownInterval) clearInterval(reviewCooldownInterval);

    const label = btn.querySelector(".front span");
    const totalSeconds = Math.max(1, Math.ceil((until - Date.now()) / 1000));

    btn.disabled = true;
    label.textContent = `AGUARDE ${totalSeconds}S`;

    btn.classList.remove("is-cooldown");
    void btn.offsetWidth;
    btn.style.setProperty("--cooldown-seconds", `${totalSeconds}s`);
    btn.classList.add("is-cooldown");

    reviewCooldownInterval = setInterval(() => {
      const remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(reviewCooldownInterval);
        reviewCooldownInterval = null;
        try {
          localStorage.removeItem(REVIEW_COOLDOWN_KEY);
        } catch (e) {}
        btn.disabled = false;
        btn.classList.remove("is-cooldown");
        label.textContent = "REVISAR TEXTOS";
      } else {
        label.textContent = `AGUARDE ${remaining}S`;
      }
    }, 1000);
  }

  function startReviewCooldown(seconds) {
    const until = Date.now() + seconds * 1000;
    try {
      localStorage.setItem(REVIEW_COOLDOWN_KEY, String(until));
    } catch (e) {}
    runReviewCooldownUntil(until);
  }

  function resumeReviewCooldown() {
    let until = 0;
    try {
      until = Number(localStorage.getItem(REVIEW_COOLDOWN_KEY)) || 0;
    } catch (e) {}
    if (until > Date.now()) runReviewCooldownUntil(until);
  }

  async function requestTextReview() {
    const inicioFato = byId("inicioFato");
    const desfecho = byId("desfecho");
    const btn = byId("btn-review-textos");

    if (!nonEmpty(inicioFato?.value) || !nonEmpty(desfecho?.value)) {
      ui.alert("Revisão de Texto", "Preencha os dois campos antes de revisar.");
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.querySelector(".front span").textContent = "REVISANDO...";
    }

    try {
      const texts = { inicioFato: inicioFato.value, desfecho: desfecho.value };
      const response = await fetch("/api/check-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: texts }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Status ${response.status}`);
      }

      const prepared = prepareReview(texts, result.changes || []);
      if (prepared.changes.length === 0) {
        ui.alert("Revisão de Texto", "Nenhuma correção encontrada.");
        return;
      }

      reviewTexts = texts;
      reviewChanges = prepared.changes.map((c) => ({ ...c, selected: true }));
      reviewSpans = prepared.spans;
      openReviewModal();
    } catch (e) {
      ui.alert("Erro na Revisão", e.message);
    } finally {
      startReviewCooldown(REVIEW_COOLDOWN_SECONDS);
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const WORD_CHAR = /[\p{L}\p{N}_]/u;

  function findOccurrences(text, needle) {
    const positions = [];
    const startsWithWord = WORD_CHAR.test(needle[0]);
    const endsWithWord = WORD_CHAR.test(needle[needle.length - 1]);
    let from = 0;
    while (true) {
      const idx = text.indexOf(needle, from);
      if (idx === -1) break;
      const end = idx + needle.length;
      const boundaryBefore =
        !startsWithWord || idx === 0 || !WORD_CHAR.test(text[idx - 1]);
      const boundaryAfter =
        !endsWithWord || end === text.length || !WORD_CHAR.test(text[end]);
      if (boundaryBefore && boundaryAfter) positions.push(idx);
      from = idx + 1;
    }
    return positions;
  }

  function resolveReviewSpans(texts, changes) {
    const spans = [];

    REVIEW_FIELDS.forEach((field) => {
      const text = texts[field] || "";
      const groups = new Map();
      changes.forEach((change, changeIdx) => {
        if (change.field !== field) return;
        if (!groups.has(change.original)) groups.set(change.original, []);
        groups.get(change.original).push(changeIdx);
      });

      const fieldSpans = [];
      groups.forEach((changeIdxs, original) => {
        const positions = findOccurrences(text, original);
        const repeatsEverywhere =
          changeIdxs.length === 1 && original.trim().length > 2;
        const covered = repeatsEverywhere
          ? positions.length
          : Math.min(changeIdxs.length, positions.length);
        for (let n = 0; n < covered; n++) {
          fieldSpans.push({
            field,
            start: positions[n],
            end: positions[n] + original.length,
            changeIdx: changeIdxs[Math.min(n, changeIdxs.length - 1)],
          });
        }
      });

      fieldSpans.sort((a, b) => a.start - b.start);
      let lastEnd = 0;
      fieldSpans.forEach((span) => {
        if (span.start < lastEnd) return;
        spans.push(span);
        lastEnd = span.end;
      });
    });

    return spans;
  }

  function prepareReview(texts, rawChanges) {
    const valid = rawChanges.filter(
      (c) =>
        REVIEW_FIELDS.includes(c.field) &&
        nonEmpty(c.original) &&
        typeof c.replacement === "string" &&
        c.original !== c.replacement,
    );

    const spans = resolveReviewSpans(texts, valid);
    const remap = new Map();
    const changes = [];
    valid.forEach((change, oldIdx) => {
      if (!spans.some((s) => s.changeIdx === oldIdx)) return;
      remap.set(oldIdx, changes.length);
      changes.push(change);
    });

    return {
      changes,
      spans: spans.map((s) => ({ ...s, changeIdx: remap.get(s.changeIdx) })),
    };
  }

  function buildMarkedHtml(field, mode) {
    const text = reviewTexts[field] || "";
    let html = "";
    let cursor = 0;

    reviewSpans
      .filter((s) => s.field === field)
      .forEach((span) => {
        const change = reviewChanges[span.changeIdx];
        const original = text.slice(span.start, span.end);
        html += escapeHtml(text.slice(cursor, span.start));
        if (mode === "original") {
          html += `<mark class="mark-err" data-tooltip="${escapeHtml(change.type)}">${escapeHtml(original)}</mark>`;
        } else if (change.selected) {
          html += `<mark class="mark-fix" data-tooltip="${escapeHtml(change.type)}">${escapeHtml(change.replacement)}</mark>`;
        } else {
          html += escapeHtml(original);
        }
        cursor = span.end;
      });

    return html + escapeHtml(text.slice(cursor));
  }

  function renderReviewPanels() {
    const originalBox = byId("review-original");
    const correctedBox = byId("review-corrected");
    if (!originalBox || !correctedBox) return;

    const renderMode = (mode) =>
      REVIEW_FIELDS.map(
        (id) =>
          `<div class="review-block"><strong>${escapeHtml(FIELD_LABELS[id])}</strong><p>${buildMarkedHtml(id, mode)}</p></div>`,
      ).join("");

    originalBox.innerHTML = renderMode("original");
    correctedBox.innerHTML = renderMode("corrected");
  }

  function renderReviewChecklist() {
    const list = byId("review-checklist");
    if (!list) return;

    list.innerHTML = "";
    reviewChanges.forEach((change, i) => {
      const occurrences = reviewSpans.filter((s) => s.changeIdx === i).length;
      const item = document.createElement("label");
      item.className = "review-check-item";
      item.dataset.tooltip = `${FIELD_LABELS[change.field] || change.field} — ${change.type}`;
      item.innerHTML = `
        <input type="checkbox" data-idx="${i}" ${change.selected ? "checked" : ""} />
        <span>${escapeHtml(change.original)}${occurrences > 1 ? ` (×${occurrences})` : ""}</span>
      `;
      item.querySelector("input").addEventListener("change", (e) => {
        reviewChanges[i].selected = e.target.checked;
        renderReviewPanels();
      });
      list.appendChild(item);
    });
  }

  function openReviewModal() {
    renderReviewPanels();
    renderReviewChecklist();
    byId("modal-review")?.classList.add("show");
  }

  function applyReviewChanges() {
    REVIEW_FIELDS.forEach((field) => {
      const original = reviewTexts[field] || "";
      let text = original;

      reviewSpans
        .filter((s) => s.field === field && reviewChanges[s.changeIdx].selected)
        .sort((a, b) => b.start - a.start)
        .forEach((span) => {
          text =
            text.slice(0, span.start) +
            reviewChanges[span.changeIdx].replacement +
            text.slice(span.end);
        });

      const el = byId(field);
      if (el && text !== original) {
        el.value = text;
        el.dispatchEvent(new Event("input"));
      }
    });

    byId("modal-review")?.classList.remove("show");
  }

  /* ========================================================================== */
  /* Event Listeners & Actions                                                  */
  /* ========================================================================== */
  function wireActions() {
    byId("btn-review-textos")?.addEventListener("click", requestTextReview);
    byId("btn-review-cancel")?.addEventListener("click", () =>
      byId("modal-review").classList.remove("show"),
    );
    byId("btn-review-apply")?.addEventListener("click", applyReviewChanges);
    resumeReviewCooldown();

    byId("clear")?.addEventListener("click", (e) => {
      e.preventDefault();
      ui.confirm("Limpar Formulário", "Deseja apagar tudo?", () => clearAll());
    });

    byId("generateWord")?.addEventListener("click", prepareDocument);

    byId("btn-word-only")?.addEventListener("click", () => {
      if (currentDocBlob) {
        downloadBlob(currentDocBlob, currentFileName + ".docx");
        trackEvent("word");
      }
      byId("modal-format").classList.remove("show");
    });

    byId("btn-word-pdf")?.addEventListener("click", () => {
      if (currentDocBlob) {
        downloadBlob(currentDocBlob, currentFileName + ".docx");
        trackEvent("word_pdf");
        generateAndDownloadPDF();
      }
    });

    window.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal"))
        e.target.classList.remove("show");
    });

    byId("copy")?.addEventListener("click", () => {
      const row = $("#excel tbody tr");
      if (row)
        navigator.clipboard
          .writeText(row.innerText)
          .then(() => ui.alert("Sucesso", "Copiado!"));
    });

    // --- Modal Coordenadas ---
    const modalCoords = byId("modal-coords");
    const btnOpenCoords = byId("btn-open-coords");
    const btnCancelCoords = byId("btn-coords-cancel");
    const btnApplyCoords = byId("btn-coords-apply");
    const inputCoords = byId("coords-input");

    const coordsStatus = byId("coords-status");
    const updateCoordsStatus = () => {
      if (!coordsStatus || !inputCoords) return;
      const text = inputCoords.value.trim();
      const c = text ? extractCoordinates(text) : null;
      coordsStatus.className = "coords-status";
      if (!text) {
        coordsStatus.textContent = "Aguardando você colar as coordenadas...";
      } else if (c) {
        coordsStatus.classList.add("ok");
        coordsStatus.textContent = `\u2713 Latitude ${c.lat.toFixed(6)} \u00b7 Longitude ${c.lng.toFixed(6)} \u2014 agora é só clicar em PROCESSAR`;
      } else {
        coordsStatus.classList.add("bad");
        coordsStatus.textContent =
          "Não encontrei as coordenadas. Copie as duas linhas (Latitude e Longitude) e cole de novo.";
      }
      if (btnApplyCoords) btnApplyCoords.classList.toggle("is-disabled", !c);
    };
    if (inputCoords) {
      inputCoords.addEventListener("input", updateCoordsStatus);
      inputCoords.addEventListener("paste", () => setTimeout(updateCoordsStatus, 0));
    }

    if (btnOpenCoords) {
      btnOpenCoords.addEventListener("click", (e) => {
        e.preventDefault();
        if (inputCoords) inputCoords.value = "";
        updateCoordsStatus();
        if (modalCoords) {
          modalCoords.classList.add("show");
          setTimeout(() => inputCoords && inputCoords.focus(), 100);
        }
      });
    }

    if (btnCancelCoords) {
      btnCancelCoords.addEventListener("click", (e) => {
        e.preventDefault();
        if (modalCoords) modalCoords.classList.remove("show");
      });
    }

    /* ---------------------------------------------------------------------- */
    /* Geocoding Logic (Updated with Map Modal)                               */
    /* ---------------------------------------------------------------------- */
    if (btnApplyCoords) {
      btnApplyCoords.addEventListener("click", async (e) => {
        e.preventDefault();
        const text = inputCoords ? inputCoords.value : "";
        const coords = extractCoordinates(text);

        if (coords) {
          if (modalCoords) modalCoords.classList.remove("show");

          const logradouroInput = byId("logradouro");
          const numeroInput = byId("numero");
          const bairroInput = byId("bairro");

          // Feedback visual
          logradouroInput.value = "BUSCANDO...";
          logradouroInput.setAttribute("readonly", true);

          try {
            const response = await fetch("/api/geocode", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(coords),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Erro na API");

            // Extração
            let street = "",
              number = "",
              neighborhood = "",
              sublocality = "",
              adm_area = "";
            if (data.components) {
              data.components.forEach((c) => {
                if (c.types.includes("route")) street = c.long_name;
                if (c.types.includes("street_number")) number = c.long_name;
                if (c.types.includes("neighborhood"))
                  neighborhood = c.long_name;
                if (
                  c.types.includes("sublocality") ||
                  c.types.includes("sublocality_level_1")
                )
                  sublocality = c.long_name;
                if (c.types.includes("administrative_area_level_2"))
                  adm_area = c.long_name;
              });
            }

            // Define os valores finais (mas NÃO preenche os campos ainda)
            let finalStreet = "";
            if (street) finalStreet = street.toUpperCase();
            else {
              let clean = data.address.split(" - ")[0];
              if (clean.includes(",")) clean = clean.split(",")[0];
              finalStreet = clean.toUpperCase();
            }

            let finalNumber = number || "";

            let finalBairro = "";
            if (neighborhood) finalBairro = neighborhood.toUpperCase();
            else if (sublocality) finalBairro = sublocality.toUpperCase();
            else if (adm_area) finalBairro = adm_area.toUpperCase();

            // Limpa o estado de "carregando"
            logradouroInput.value = "";
            logradouroInput.removeAttribute("readonly");

            // --- Lógica do Modal de Mapa ---
            const displayAddress = `${finalStreet}, ${finalNumber || "S/N"} - ${finalBairro}`;
            const mapText = byId("map-address-text");
            const mapFrame = byId("google-map-frame");
            const modalMap = byId("modal-map");

            // Referências aos botões do Modal de Mapa
            const btnConfirmMap = byId("btn-confirm-map");
            const btnMapBack = byId("btn-map-back");

            if (mapText) mapText.textContent = displayAddress;

            // Usa URL de Embed padrão (sem chave exposta, zoom 19, mapa normal)
            if (mapFrame) {
              mapFrame.src = `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=19&output=embed`;
            }

            if (modalMap) modalMap.classList.add("show");

            // Helper para limpar erros visualmente
            const forceClearError = (input, errorId) => {
              if (input) {
                input.classList.remove("invalid");
                input.classList.add("valid");
              }
              const err = byId(errorId);
              if (err) err.style.display = "none";
            };

            // Lógica do Botão VOLTAR (Reabre o modal de coordenadas)
            if (btnMapBack) {
              const newBack = btnMapBack.cloneNode(true);
              btnMapBack.parentNode.replaceChild(newBack, btnMapBack);
              newBack.addEventListener("click", () => {
                modalMap.classList.remove("show");
                if (modalCoords) modalCoords.classList.add("show");
              });
            }

            // Lógica do Botão CONFIRMAR (Preenche os campos e fecha)
            if (btnConfirmMap) {
              const newBtn = btnConfirmMap.cloneNode(true);
              btnConfirmMap.parentNode.replaceChild(newBtn, btnConfirmMap);
              newBtn.addEventListener("click", () => {
                // Preenche
                logradouroInput.value = finalStreet;
                numeroInput.value = finalNumber;
                bairroInput.value = finalBairro;

                // Salva e valida
                logradouroInput.dispatchEvent(new Event("input"));
                numeroInput.dispatchEvent(new Event("input"));
                bairroInput.dispatchEvent(new Event("input"));

                // Força a limpeza visual de erros (caso o validador não pegue imediatamente)
                forceClearError(logradouroInput, "logradouroError");
                forceClearError(numeroInput, "numeroError");
                forceClearError(bairroInput, "bairroError");

                if (modalMap) modalMap.classList.remove("show");
                ui.alert("Sucesso", "Endereço confirmado e preenchido.");
              });
            }
          } catch (err) {
            console.error(err);
            logradouroInput.value = `GPS: ${coords.lat}, ${coords.lng}`;
            logradouroInput.removeAttribute("readonly");
            logradouroInput.dispatchEvent(new Event("input"));
            ui.alert(
              "Aviso",
              "Google não retornou endereço completo. Usando GPS.",
            );
          }
        } else {
          ui.alert("Erro", "Coordenadas inválidas.");
        }
      });
    }

    // --- Outros Listeners (Paste Area, Notes, Quick Options) ---
    const pasteArea = byId("paste-area");
    if (pasteArea) {
      pasteArea.addEventListener("click", handlePasteFromClipboard);
      wireDragAndDrop(pasteArea);
      pasteArea.addEventListener("paste", (e) => {
        e.preventDefault();
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
          if (item.kind === "file" && item.type.includes("image/"))
            processImageFile(item.getAsFile());
        }
      });
    }

    byId("notes")?.addEventListener("click", () =>
      byId("modal").classList.add("show"),
    );

    const optBtn = byId("opt-apply-a");
    if (optBtn)
      optBtn.addEventListener("click", () => {
        const sel = byId("opt-action-a");
        const val = sel?.value;
        if (!val || val === "clear-all") return;
        const setV = (id, v) => {
          const el = byId(id);
          if (el) {
            el.value = v;
            el.dispatchEvent(new Event("input"));
          }
        };
        clearAll();
        sel.value = val;
        if (val === "avaria-coletivo") {
          setV("ocorrencia", "AVARIA NO COLETIVO");
          setV("logradouro", "GARAGEM UNIÃO");
          setV("numero", "244");
          setV("bairro", "JARDIM GUANABARA");
          Object.assign(people.driver[0], {
            Name: "NÃO CABE",
            Cpf: "-",
            Situation: "-",
          });
          savePeople();
          renderPeople("driver");
          refreshBoxes();
          setV(
            "inicioFato",
            `INSPETOR OPERACIONAL __________ INFORMA. TRATA-SE DE UMA AVARIA ENCONTRADA NO COLETIVO ______, DENTRO DA GARAGEM UNIÃO, COLETIVO FOI ENCONTRADO PELO OPERACIONAL ÀS _________, NO ____________ COM A ______________ DANIFICADA.`,
          );
          setV(
            "desfecho",
            "OPERACIONAL ___________ COMPARECEU AO CCO PARA INFORMAR SOBRE A AVARIA.",
          );
        } else if (val === "geral") {
          setV(
            "inicioFato",
            `INSPETOR OPERACIONAL _____________ RELATA. TRATA-SE DE ______________, ENVOLVENDO O COLETIVO ______________, CONDUZIDO POR ______________________, PORTADOR DO CPF: ___________________, O MESMO RELATA _______________________________. \n\nNA ANÁLISE DAS CÂMERAS, __________________________________________.`,
          );
        }
      });

    /* ========================================================================== */
    /* E-mails & Spreadsheet                                                      */
    /* ========================================================================== */
    const RAW_EMAILS = {
      cc: "reinaldooperacional@wolffsp.com,robertooperacional@wolffsp.com,celsooperacional@wolffsp.com,yvanoperacional@wolffsp.com",
      base: "danilo.silva@wolffsp.com,sinistro@wolffsp.com,beatrizsinistro@wolffsp.com,gustavosinistro@wolffsp.com,maianesinistro@wolffsp.com",
      funilaria: "funilariad10@wolffsp.com",
      treinamento: "treinamento1@wolffsp.com",
      estoque: "estoquepecasd10@wolffsp.com",
    };
    const SCENARIOS = {
      "sem-danos": RAW_EMAILS.base,
      "com-danos": `${RAW_EMAILS.base},${RAW_EMAILS.funilaria}`,
      "delicado-sem-danos": `${RAW_EMAILS.base},${RAW_EMAILS.treinamento}`,
      "delicado-com-danos": `${RAW_EMAILS.base},${RAW_EMAILS.treinamento},${RAW_EMAILS.funilaria}`,
      furto: `${RAW_EMAILS.base},${RAW_EMAILS.treinamento},${RAW_EMAILS.funilaria},${RAW_EMAILS.estoque}`,
    };

    function getFormattedSubject() {
      const getVal = (id) =>
        (document.getElementById(id)?.value || "").toUpperCase().trim();
      const dateRaw = getDateIso();
      const dateFmt = formatPtBrDate(dateRaw);
      const dateSubject = dateFmt
        ? dateFmt.replace(/\//g, ".").slice(0, 5)
        : "";
      return `${getVal("nOc")} - ${dateSubject} - ${getVal("linha")} - ${getVal("coletivo")} - ${getVal("ocorrencia")} - ${getVal("logradouro")}`;
    }

    document.querySelectorAll(".email-trigger").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const type = e.target
          .closest(".email-trigger")
          .getAttribute("data-type");
        const url = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${SCENARIOS[type]}&cc=${RAW_EMAILS.cc}&su=${encodeURIComponent(getFormattedSubject())}&body=${encodeURIComponent("Prezados,\n\nSegue em anexo a ocorrência.\n\nAtt. __________")}`;
        window.open(url, "_blank");
      });
    });

    const SHEET_CONFIG = {
      id: "1OcIUjqUdEszN1z0GqoqUoFJaDHdriiprTfgG61wApog",
      gid: "666841944",
    };
    document.getElementById("openSheet")?.addEventListener("click", (e) => {
      e.preventDefault();
      const nOcInput = document.getElementById("nOc");
      const rawValue = nOcInput?.value || "";
      const ocNumber = parseInt(rawValue.toUpperCase().replace("6A", ""), 10);
      if (isNaN(ocNumber)) {
        ui.alert("Erro", "Número da OC inválido.");
        return;
      }
      window.open(
        `https://docs.google.com/spreadsheets/d/${SHEET_CONFIG.id}/edit#gid=${SHEET_CONFIG.gid}&range=B${ocNumber + 2}`,
        "_blank",
      );
    });
  }

  function init() {
    wirePersistence();
    wirePeople();
    wireBoxes();
    wireValidators();
    wireTimeInputs(["time"]);
    wireDateInput();
    wireActions();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
