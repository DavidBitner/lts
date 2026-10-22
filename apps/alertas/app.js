/* ========================================================================== */
/* Alertas App                                                                */
/* - Quill init + toolbar                                                     */
/* - Namespaced autosave to localStorage (optional but enabled)               */
/* - Copy button handler                                                      */
/* ========================================================================== */

(() => {
  'use strict';

  const APP_NS = 'alertas:'; // storage namespace

  // tiny store wrapper (namespaced)
  const store = {
    get(k) { return localStorage.getItem(APP_NS + k); },
    set(k, v) { localStorage.setItem(APP_NS + k, v); },
    remove(k) { localStorage.removeItem(APP_NS + k); },
    clearAll() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(APP_NS)) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    }
  };

  const trackEvent = (type) => {
    try {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "alertas", type }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  };

  function init() {
    // Quill editor
    const quill = new Quill('#editor', {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ header: [1, 2, false] }],
          ['bold', 'italic', 'underline'],
          [{ color: [] }, { background: [] }],
          [{ align: [] }],
          ['clean']
        ]
      }
    });

    // Restore saved HTML (if any)
    const saved = store.get('editorHtml');
    if (saved) {
      quill.root.innerHTML = saved;
    }

    // Autosave on change (debounced)
    let t = null;
    quill.on('text-change', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        store.set('editorHtml', quill.root.innerHTML);
      }, 250);
    });

    // Copy button
    const copyBtn = document.getElementById('copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const html = quill.root.innerHTML;
        await navigator.clipboard.writeText(html);
        trackEvent('copy');
        alert('HTML copiado');
      });
    }

    // Expose a minimal API if you ever need it elsewhere
    window.AlertasApp = {
      clear: () => { store.clearAll(); quill.root.innerHTML = ''; }
    };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
