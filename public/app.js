/**
 * Phoenix Invoice & Quote lookup — single-form UI.
 */
(function () {
  const form = document.getElementById('lookup-form');
  const input = document.getElementById('lookup-input');
  const mode = document.getElementById('mode-select');
  const submitBtn = document.getElementById('submit-btn');
  const errorEl = document.getElementById('error');
  const resultEl = document.getElementById('result');
  const titleEl = document.getElementById('result-title');
  const badgeEl = document.getElementById('result-badge');
  const customerEl = document.getElementById('result-customer');
  const totalEl = document.getElementById('result-total');
  const createdEl = document.getElementById('result-created');
  const statusEl = document.getElementById('result-status');
  const downloadBtn = document.getElementById('download-btn');

  // Prefill from ?q=… (so a Shopify Admin link/bookmarklet can deep-link)
  const params = new URLSearchParams(window.location.search);
  if (params.get('q')) {
    input.value = params.get('q');
    if (params.get('mode')) mode.value = params.get('mode');
    setTimeout(() => form.requestSubmit(), 50);
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
  }

  function hideError() {
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
  }

  function formatCurrency(amount, ccy) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: ccy || 'USD',
      }).format(amount || 0);
    } catch (e) {
      return '$' + Number(amount || 0).toFixed(2);
    }
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch (e) { return iso; }
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.innerHTML = busy
      ? '<span class="spinner"></span> Searching…'
      : 'Look Up';
  }

  async function doLookup(q, m) {
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, mode: m }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Lookup failed (HTTP ${res.status})`);
    }
    return data;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    hideError();
    resultEl.classList.add('hidden');

    const q = input.value.trim();
    if (!q) return;
    setBusy(true);

    try {
      const data = await doLookup(q, mode.value);
      const s = data.summary;

      titleEl.textContent = `${data.type === 'order' ? 'Invoice' : 'Quote'} ${s.number || ''}`;

      badgeEl.className = 'badge';
      if (data.type === 'order') {
        const paid = /paid/i.test(s.financialStatus || '');
        badgeEl.classList.add(paid ? 'invoice' : 'unpaid');
        badgeEl.textContent = paid ? 'Paid Invoice' : (s.financialStatus || 'Invoice');
      } else {
        badgeEl.classList.add('quote');
        badgeEl.textContent = 'Quote';
      }

      customerEl.textContent = s.customer || s.email || '—';
      totalEl.textContent = formatCurrency(s.total, s.currency);
      createdEl.textContent = formatDate(s.createdAt);

      const statusBits = [];
      if (s.financialStatus) statusBits.push(s.financialStatus);
      if (s.fulfillmentStatus) statusBits.push(s.fulfillmentStatus);
      if (s.draftStatus) statusBits.push(s.draftStatus);
      statusEl.textContent = statusBits.join(' · ') || '—';

      downloadBtn.href = data.downloadUrl;
      resultEl.classList.remove('hidden');
    } catch (err) {
      showError(err.message || 'Lookup failed');
    } finally {
      setBusy(false);
    }
  });
})();
