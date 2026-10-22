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
  const MAX_DOC_HEIGHT = 800;

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
    setValidity(el, nonEmpty(el.value), byId("dateError"));
  }

  function validateOcorrencia() {
    const el = byId("ocorrencia");
    if (!el) return;
    el.value = el.value.toUpperCase();
    setValidity(el, nonEmpty(el.value), byId("ocorrenciaError"));
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
    attachedImages.push({ src: base64, w: width, h: height });
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

  function renderGallery() {
    const container = byId("paste-area");
    if (!container) return;
    const existingGallery = container.querySelector(".img-preview-container");
    if (existingGallery) existingGallery.remove();

    if (attachedImages.length > 0) {
      const gallery = document.createElement("div");
      gallery.className = "img-preview-container";
      gallery.style.cssText =
        "display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px; justify-content: center;";

      attachedImages.forEach((item, index) => {
        const wrap = document.createElement("div");
        wrap.style.cssText = "position: relative; animation: fadeIn 0.3s ease;";
        const img = document.createElement("img");
        img.src = item.src;
        img.style.cssText =
          "height: 100px; border-radius: 4px; border: 1px solid #ccc; box-shadow: 0 2px 5px rgba(0,0,0,0.2); object-fit: cover;";
        const btnRemove = document.createElement("button");
        btnRemove.innerText = "X";
        btnRemove.style.cssText =
          "position: absolute; top: -8px; right: -8px; background: red; color: white; border: 2px solid white; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-weight: bold; font-size: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);";
        btnRemove.onclick = (e) => {
          e.stopPropagation();
          delete imageDimensionsCache[item.src];
          attachedImages.splice(index, 1);
          renderGallery();
        };
        wrap.appendChild(img);
        wrap.appendChild(btnRemove);
        gallery.appendChild(wrap);
      });
      container.appendChild(gallery);
    }
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
        dateRaw: byId("date")?.value || "",
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
      requireField("inicio", "Início", inputs.inicio);
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
      const imageOpts = {
        centered: false,
        getImage: (tagValue) =>
          base64DataURLToArrayBuffer(tagValue) || new ArrayBuffer(0),
        getSize: function (img, tagValue) {
          const dims = imageDimensionsCache[tagValue];
          if (!dims) return [500, 300];
          let { w, h } = dims;
          if (w > MAX_DOC_WIDTH) {
            const r = MAX_DOC_WIDTH / w;
            w = MAX_DOC_WIDTH;
            h = h * r;
          }
          if (h > MAX_DOC_HEIGHT) {
            const r = MAX_DOC_HEIGHT / h;
            h = MAX_DOC_HEIGHT;
            w = w * r;
          }
          return [w, h];
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

      const fotosData = attachedImages.map((img) => ({ imagem: img.src }));

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
      if (currentDocBlob)
        downloadBlob(currentDocBlob, currentFileName + ".docx");
      byId("modal-format").classList.remove("show");
    });

    byId("btn-word-pdf")?.addEventListener("click", () => {
      if (currentDocBlob) {
        downloadBlob(currentDocBlob, currentFileName + ".docx");
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
    wireModal();
    wireActions();
    wireOptionsPanel();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
