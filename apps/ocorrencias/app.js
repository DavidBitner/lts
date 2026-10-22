/* ========================================================================== */
/* Ocorrências App - Atualizado com Geocoding e Imagens                       */
/* ========================================================================== */

(() => {
  "use strict";

  /* ------------------------------------------------------------------------ */
  /* Config & State                                                           */
  /* ------------------------------------------------------------------------ */
  const APP_NS = "ocorrencias:";
  const YEAR_SUFFIX = "2026";
  const MAX_DOC_WIDTH = 680;
  const MAX_DOC_HEIGHT = 780;
  const PAIR_MAX_HEIGHT = 380;
  const CAPTION_MAX_LENGTH = 120;

  let attachedImages = [];
  let imageDimensionsCache = {};
  let currentDocBlob = null;
  let currentFileName = "";

  /* ------------------------------------------------------------------------ */
  /* DOM utils                                                                */
  /* ------------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);
  const trackEvent = (type) => {
    try {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "ocorrencias", type }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  };
  const setText = (id, text) => {
    const el = byId(id);
    if (el) el.textContent = text;
  };
  const nonEmpty = (v) => v != null && String(v).trim() !== "";

  /* ------------------------------------------------------------------------ */
  /* UI: Alerts & Modals                                                      */
  /* ------------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------------ */
  /* Storage (namespaced)                                                     */
  /* ------------------------------------------------------------------------ */
  const store = {
    get(k) {
      return window.localStorage.getItem(APP_NS + k);
    },
    set(k, v) {
      window.localStorage.setItem(APP_NS + k, v);
    },
    remove(k) {
      window.localStorage.removeItem(APP_NS + k);
    },
    clearAll() {
      const toDel = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(APP_NS)) toDel.push(k);
      }
      toDel.forEach((k) => window.localStorage.removeItem(k));
    },
  };

  function restoreField(el) {
    if (!el.id) return;
    const saved = store.get(el.id);
    if (saved === null) return;
    if (el.type === "checkbox" || el.type === "radio")
      el.checked = saved === "true";
    else el.value = saved;
  }

  function persistField(el) {
    if (!el.id) return;
    if (el.type === "checkbox" || el.type === "radio")
      store.set(el.id, String(el.checked));
    else store.set(el.id, el.value.trim());
  }

  function wirePersistence(root = document) {
    const fields = $$("input[id], textarea[id], select[id]", root);
    fields.forEach((el) => {
      restoreField(el);
      el.addEventListener("input", () => persistField(el));
      el.addEventListener("change", () => persistField(el));
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Validation                                                               */
  /* ------------------------------------------------------------------------ */
  function setValidity(el, ok, errEl) {
    if (!el) return;
    el.classList.toggle("invalid", !ok);
    el.classList.toggle("valid", ok);
    if (errEl) errEl.style.display = ok ? "none" : "inline";
  }

  function validateNoc() {
    const nOc = byId("nOc");
    if (!nOc) return;
    nOc.value = nOc.value.toUpperCase();
    setValidity(nOc, /^6C\d{4}$/.test(nOc.value), byId("nOcError"));
  }

  function validateDate() {
    const el = byId("date");
    if (!el) return;
    setValidity(el, !!parseBrDate(el.value), byId("dateError"));
  }

  function validateOcorrencia() {
    const el = byId("ocorrencia");
    if (!el) return;
    el.value = el.value.toUpperCase();
    setValidity(el, nonEmpty(el.value), byId("ocorrenciaError"));
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
    const map = {
      nOc: validateNoc,
      ocorrencia: validateOcorrencia,
      date: validateDate,
    };
    Object.entries(map).forEach(([id, fn]) => {
      const el = byId(id);
      if (el) el.addEventListener("blur", fn);
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Modal (notes)                                                            */
  /* ------------------------------------------------------------------------ */
  function wireModal() {
    const modal = byId("modal");
    const notesBtn = byId("notes");
    if (!modal || !notesBtn) return;
    notesBtn.addEventListener("click", () => modal.classList.add("show"));
    modal.addEventListener("click", (evt) => {
      const content = $(".modal-content", modal) || modal;
      if (!content.contains(evt.target)) modal.classList.remove("show");
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Date / Geocoding helpers                                                 */
  /* ------------------------------------------------------------------------ */
  function formatPtBrDate(yyyyMmDd) {
    if (!nonEmpty(yyyyMmDd)) return "";
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(y, m - 1, d);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString("pt-BR").toUpperCase();
  }

  function getYearSuffix(yyyyMmDd) {
    if (YEAR_SUFFIX) return YEAR_SUFFIX;
    if (nonEmpty(yyyyMmDd)) {
      const y = Number(yyyyMmDd.slice(0, 4));
      if (y) return String(y);
    }
    return String(new Date().getFullYear());
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

  /* ------------------------------------------------------------------------ */
  /* Image Processing                                                         */
  /* ------------------------------------------------------------------------ */
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

  async function handlePasteFromClipboard() {
    const container = byId("paste-area");
    if (!container) return;
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
    if (!area) return;
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

  /* ------------------------------------------------------------------------ */
  /* Clear UI + storage                                                       */
  /* ------------------------------------------------------------------------ */
  function clearAll() {
    store.clearAll();
    $$("input, textarea, select").forEach((input) => {
      if (input.type === "checkbox" || input.type === "radio")
        input.checked = false;
      else input.value = "";
    });
    attachedImages = [];
    imageDimensionsCache = {};
    renderGallery();
    const excel = byId("excel");
    if (excel) excel.classList.add("hidden");
  }

  /* ------------------------------------------------------------------------ */
  /* Generate Word (Docxtemplater + PizZip)                                   */
  /* ------------------------------------------------------------------------ */
  async function loadTemplate() {
    const res = await fetch("template.docx");
    if (!res.ok) throw new Error("Failed to load template");
    return res.arrayBuffer();
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

  async function handleGenerateWord() {
    try {
      const getVal = (id) => (byId(id)?.value || "").toUpperCase().trim();
      const inputs = {
        nOc: getVal("nOc"),
        ocorrencia: getVal("ocorrencia"),
        dateRaw: getDateIso(),
        inicio: getVal("inicio"),
        termino: getVal("termino") || "-",
        logradouro: getVal("logradouro"),
        numero: getVal("numero"),
        bairro: getVal("bairro"),
        inicioFato: getVal("inicioFato"),
        motivo: getVal("motivo") || "NÃO CABE",
        respObra: getVal("respObra") || "NÃO CABE",
        desviosbc: getVal("desviosbc") || "NÃO HOUVE",
        desvioscb: getVal("desvioscb") || "NÃO HOUVE",
        linhasAfetadas: getVal("linhasAfetadas") || "NÃO HOUVE",
        alerta: getVal("alerta") || "NÃO HOUVE",
        linha: getVal("linha") || "NÃO HOUVE",
        ocSptrans: getVal("ocSptrans") || "NÃO HOUVE",
        contato: getVal("contato") || "NÃO HOUVE",
        cco: getVal("cco"),
        operacional: getVal("operacional") || "NÃO HOUVE",
      };

      const dateFmt = formatPtBrDate(inputs.dateRaw);
      const missing = [];
      const requireField = (id, label, value) => {
        if (!nonEmpty(value)) missing.push({ id, label });
      };

      requireField("nOc", "Número da OC", inputs.nOc);
      requireField("ocorrencia", "Ocorrência", inputs.ocorrencia);
      requireField("date", "Data", dateFmt);
      requireField(
        "inicio",
        "Início",
        TIME_PATTERN.test(inputs.inicio) ? inputs.inicio : "",
      );
      if (inputs.termino !== "-" && !TIME_PATTERN.test(inputs.termino))
        missing.push({ id: "termino", label: "Término" });
      requireField("logradouro", "Logradouro", inputs.logradouro);
      requireField("numero", "Número do endereço", inputs.numero);
      requireField("bairro", "Bairro", inputs.bairro);
      requireField("inicioFato", "Corpo da Ocorrência", inputs.inicioFato);
      requireField("cco", "CCO", inputs.cco);

      if (missing.length > 0) {
        reportMissing(missing);
        return;
      }

      const year = getYearSuffix(inputs.dateRaw);

      // Setup ImageModule if present
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

      doc.setData({
        ...inputs,
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
      currentFileName = `${inputs.nOc} - ${dateFmt.replace(/\//g, ".").slice(0, 5)}${inputs.linha !== "NÃO HOUVE" ? " - " + inputs.linha : ""} - ${inputs.ocorrencia} - ${inputs.logradouro}`;

      // Update Preview table
      setText("td-nOc", `${inputs.nOc}/${year}`);
      setText("td-date", dateFmt);
      setText("td-alerta", inputs.alerta);
      setText("td-ocorrencia", inputs.ocorrencia);
      setText("td-logradouro", inputs.logradouro);
      setText("td-operacional", inputs.operacional);
      setText("td-ocSptrans", inputs.ocSptrans);
      setText("td-contato", inputs.contato);
      setText("td-termino", inputs.termino);
      setText("td-cco", inputs.cco);
      setText("td-fechamento", inputs.cco);

      const excel = byId("excel");
      if (excel) excel.classList.remove("hidden");

      // Open Download Modal
      byId("modal-format").classList.add("show");
    } catch (err) {
      console.error("Error generating document:", err);
      ui.alert("Erro", "Error generating document: " + err.message);
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

  /* ------------------------------------------------------------------------ */
  /* Wire buttons / actions                                                   */
  /* ------------------------------------------------------------------------ */
  function wireActions() {
    const clearBtn = byId("clear");
    if (clearBtn)
      clearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        ui.confirm("Limpar Formulário", "Deseja apagar tudo?", () =>
          clearAll(),
        );
      });

    const genBtn = byId("generateWord");
    if (genBtn) genBtn.addEventListener("click", handleGenerateWord);

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

    const copyBtn = byId("copy");
    if (copyBtn)
      copyBtn.addEventListener("click", () => {
        const text = $$("#excel tbody tr:first-child td")
          .map((td) => td.innerText)
          .join("\t");
        navigator.clipboard
          .writeText(text)
          .then(() => ui.alert("Sucesso", "Linha copiada!"));
      });

    // Close modais when clicking outside content
    window.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal"))
        e.target.classList.remove("show");
    });

    // Geocoding + Maps logic
    const modalCoords = byId("modal-coords");
    const btnOpenCoords = byId("btn-open-coords");
    const btnCancelCoords = byId("btn-coords-cancel");
    const btnApplyCoords = byId("btn-coords-apply");
    const inputCoords = byId("coords-input");

    if (btnOpenCoords) {
      btnOpenCoords.addEventListener("click", (e) => {
        e.preventDefault();
        if (inputCoords) inputCoords.value = "";
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

            logradouroInput.value = "";
            logradouroInput.removeAttribute("readonly");

            const displayAddress = `${finalStreet}, ${finalNumber || "S/N"} - ${finalBairro}`;
            const mapText = byId("map-address-text");
            const mapFrame = byId("google-map-frame");
            const modalMap = byId("modal-map");

            const btnConfirmMap = byId("btn-confirm-map");
            const btnMapBack = byId("btn-map-back");

            if (mapText) mapText.textContent = displayAddress;
            if (mapFrame)
              mapFrame.src = `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=19&output=embed`;
            if (modalMap) modalMap.classList.add("show");

            if (btnMapBack) {
              const newBack = btnMapBack.cloneNode(true);
              btnMapBack.parentNode.replaceChild(newBack, btnMapBack);
              newBack.addEventListener("click", () => {
                modalMap.classList.remove("show");
                if (modalCoords) modalCoords.classList.add("show");
              });
            }

            if (btnConfirmMap) {
              const newBtn = btnConfirmMap.cloneNode(true);
              btnConfirmMap.parentNode.replaceChild(newBtn, btnConfirmMap);
              newBtn.addEventListener("click", () => {
                logradouroInput.value = finalStreet;
                numeroInput.value = finalNumber;
                bairroInput.value = finalBairro;

                logradouroInput.dispatchEvent(new Event("input"));
                numeroInput.dispatchEvent(new Event("input"));
                bairroInput.dispatchEvent(new Event("input"));

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

    // Paste area listeners
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
  }

  /* ------------------------------------------------------------------------ */
  /* Options panel (ocorrências)                                              */
  /* ------------------------------------------------------------------------ */

  function setVal(id, value) {
    const el = byId(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillSimInstabilidade() {
    setVal("ocorrencia", "INSTABILIDADE NO SISTEMA SIM");
    setVal("logradouro", "GARAGEM UNIÃO");
    setVal("numero", "-");
    setVal("bairro", "-");
    setVal(
      "inicioFato",
      `NO DIA _______, POR VOLTA DAS _______H, FOI IDENTIFICADA INSTABILIDADE NO SISTEMA "SIM", IMPOSSIBILITANDO O ACESSO AOS SERVIÇOS E FERRAMENTAS DISPONIBILIZADOS PELA PLATAFORMA. ENTRE OS RECURSOS AFETADOS, DESTACAM-SE:

*VIAGENS PROGRAMADAS E MONITORADAS;
*CONSULTAS DE VIAGENS E RESPECTIVOS DADOS (VEÍCULO, HORÁRIO, TEMPO);
*TABELA OPERACIONAL E TABELAS IVOS;
*MONITORAMENTO ONLINE DA FROTA POR GARAGEM (PEDRA ELETRÔNICA);
*MAPEAMENTO ONLINE, TRATATIVAS DE ALERTAS E CONTABILIZAÇÃO DA FROTA.

PROTOCÓLO SPTRANS Nº: _________________`,
    );
  }

  function fillFestividadePopular() {
    setVal("ocorrencia", "FESTIVIDADE POPULAR");
    setVal(
      "inicioFato",
      `INSPETOR OPERACIONAL ______________ PELO LOCA INFORMA, UMA FESTIVIDADE POPULAR ________________________________, NA VIA: ________________________________, NUMERO ____. DEVIDO AO EVENTO, HÁ UMA GRANDE CONCENTRAÇÃO DE VEÍCULOS E PEDESTRES NA VIA, O QUE IMPOSSIBILITA O TRÁFEGO DE COLETIVOS NO TRECHO.

DESVIOS B > C: ___________________________

DESVIOS C > B: ___________________________

COLETIVOS DEIXANDO DE ATENDER _____ PONTOS.

LINHAS AFETADAS: _________________________`,
    );
  }

  function fillAcidenteTerceiros() {
    setVal("ocorrencia", "ACIDENTE ENTRE TERCEIROS.");
    setVal(
      "inicioFato",
      `INSPETOR OPERACIONAL _________________ PELO LOCAL INFORMA, TRATA-SE DE UM ACIDENTE ENTRE TERCEIROS NA VIA ________________, ALTURA DO NUMERAL _________ ENVOLVENDO UM _____________ (EMPLACAMENTO: _________, MODELO: _______, ANO: _____, COR: __________, DADOS DO CONDUTOR: ____________) X ____________ (EMPLACAMENTO: _________, MODELO: _______, ANO: _____, COR: __________, DADOS DO CONDUTOR: ____________) *****INTERFERINDO NO TOTAL/PARCIAL DO VIÁRIO SENTIDO BAIRRO/CENTRO E/OU CENTRO/BAIRRO*****, OCASIONANDO CONSIDERÁVEIS LESÕES NO ANDAMENTO DA OPERAÇÃO E SENDO POTENCIAL MOTIVO DE MÚLTIPLAS INTERFERÊNCIAS NOS ÍNDICES DE PONTUALIDADE DE PARTIDA E ÍNDICES DE CUMPRIMENTO DE VIAGEM.

DESVIOS B > C: ___________________________

DESVIOS C > B: ___________________________

COLETIVOS DEIXANDO DE ATENDER _____ PONTOS.

LINHAS AFETADAS: _________________________`,
    );
  }

  function fillGeral() {
    setVal(
      "inicioFato",
      `INSPETOR OPERACIONAL _________________ PELO LOCAL INFORMA, TRATA-SE DE __________________________ NA VIA ____________________, ALTURA DO NUMERAL ____________, *****INTERFERINDO O TOTAL/PARCIAL DO VIÁRIO SENTIDO BAIRRO/CENTRO E/OU CENTRO/BAIRRO*****, OCASIONANDO CONSIDERÁVEIS LESÕES NO ANDAMENTO DA OPERAÇÃO E SENDO POTENCIAL MOTIVO DE MÚLTIPLAS INTERFERÊNCIAS NOS ÍNDICES DE PONTUALIDADE DE PARTIDA E ÍNDICES DE CUMPRIMENTO DE VIAGEM.

DESVIOS B > C: ___________________________

DESVIOS C > B: ___________________________

COLETIVOS DEIXANDO DE ATENDER _____ PONTOS

LINHAS AFETADAS: _________________________`,
    );
  }

  function fillAlagamento() {
    setVal("ocorrencia", "ALAGAMENTO");
    setVal("logradouro", "SÃO PAULO - SP");
    setVal("numero", "-");
    setVal("bairro", "-");
    setVal(
      "inicioFato",
      "DEVIDO ÀS FORTES CHUVAS NA REGIÃO SUL DE SÃO PAULO, FORMARAM-SE PONTOS DE ALAGAMENTO NAS PRINCIPAIS VIAS DE ATENDIMENTO DA EMPRESA TRANSWOLFF, EM AMBOS OS SENTIDOS (C/B E B/C). O VIÁRIO FICOU TOTALMENTE ALAGADO, COM FLUXO DE ÁGUA MODERADO, CAUSANDO DIFICULDADES NA PASSAGEM DOS COLETIVOS. OS VEÍCULOS TRANSITARAM COM EXTREMA LENTIDÃO OU, EM ALGUNS CASOS, PERMANECERAM IMOBILIZADOS, O QUE RESULTOU EM ATRASOS NAS PARTIDAS PROGRAMADAS E IMPACTOS NA OPERAÇÃO.",
    );
    setVal("desviosbc", "DIVERSOS");
    setVal("desvioscb", "DIVERSOS");
    setVal("linhasAfetadas", "REGIÃO D10");
  }

  function applyOption() {
    const sel = byId("opt-action");
    if (!sel) return;

    const choice = sel.value;
    if (!choice) return;

    clearAll();

    sel.value = choice;
    sel.dispatchEvent(new Event("change", { bubbles: true }));

    switch (choice) {
      case "clear-all":
        break;
      case "sim-instabilidade":
        fillSimInstabilidade();
        break;
      case "festividade-popular":
        fillFestividadePopular();
        break;
      case "acidente-terceiros":
        fillAcidenteTerceiros();
        break;
      case "alagamento":
        fillAlagamento();
        break;
      case "geral":
        fillGeral();
        break;
      default:
        break;
    }
  }

  function wireOptionsPanel() {
    const btn = byId("opt-apply");
    if (btn) btn.addEventListener("click", applyOption);
  }

  /* ------------------------------------------------------------------------ */
  /* Init                                                                     */
  /* ------------------------------------------------------------------------ */
  function init() {
    wirePersistence();
    wireValidators();
    wireTimeInputs(["inicio", "termino"]);
    wireDateInput();
    wireModal();
    wireActions();
    wireOptionsPanel();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
