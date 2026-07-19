const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem('nw_cart') || '{}'), // { [id]: quantity }
  activeCategory: 'All',
  paymentMethod: 'card',
};

const el = (sel) => document.querySelector(sel);
const fmt = (n) => `KES ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

function saveCart() {
  localStorage.setItem('nw_cart', JSON.stringify(state.cart));
}

function cartCount() {
  return Object.values(state.cart).reduce((s, q) => s + q, 0);
}

function cartTotal() {
  return Object.entries(state.cart).reduce((sum, [id, qty]) => {
    const p = state.products.find((x) => x.id === id);
    return p ? sum + p.price * qty : sum;
  }, 0);
}

function renderCategoryNav() {
  const cats = ['All', ...new Set(state.products.map((p) => p.category))];
  el('#catNav').innerHTML = cats.map((c) =>
    `<button data-cat="${c}" class="${c === state.activeCategory ? 'active' : ''}">${c}</button>`
  ).join('');
  el('#catNav').querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.cat;
      renderCategoryNav();
      renderCatalog();
    });
  });
}

function renderCatalog() {
  const list = state.activeCategory === 'All'
    ? state.products
    : state.products.filter((p) => p.category === state.activeCategory);

  el('#catalog').innerHTML = list.map((p) => `
    <div class="product-card">
      <div class="pin-strip">${'<span></span>'.repeat(6)}</div>
      <div class="product-body">
        <div class="product-cat">${p.category}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-spec">${p.spec}</div>
        <div class="product-model">MODEL ${p.model} · STOCK ${p.stock}</div>
        <div class="product-footer">
          <span class="price">${fmt(p.price)}</span>
          <button class="add-btn" data-id="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>
            ${p.stock === 0 ? 'OUT OF STOCK' : 'ADD +'}
          </button>
        </div>
      </div>
    </div>
  `).join('');

  el('#catalog').querySelectorAll('.add-btn').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.dataset.id));
  });
}

function addToCart(id) {
  state.cart[id] = (state.cart[id] || 0) + 1;
  saveCart();
  renderCartUI();
  openCart();
}

function changeQty(id, delta) {
  const next = (state.cart[id] || 0) + delta;
  if (next <= 0) delete state.cart[id];
  else state.cart[id] = next;
  saveCart();
  renderCartUI();
}

function renderCartUI() {
  el('#cartCount').textContent = cartCount();
  const entries = Object.entries(state.cart);

  if (entries.length === 0) {
    el('#cartItems').innerHTML = `<div class="cart-empty">Your cart is empty.</div>`;
  } else {
    el('#cartItems').innerHTML = entries.map(([id, qty]) => {
      const p = state.products.find((x) => x.id === id);
      if (!p) return '';
      return `
        <div class="cart-item">
          <span class="cart-item-name">${p.name}</span>
          <div class="cart-item-qty">
            <button class="qty-btn" data-id="${id}" data-delta="-1">−</button>
            <span class="mono">${qty}</span>
            <button class="qty-btn" data-id="${id}" data-delta="1">+</button>
          </div>
          <span class="mono">${fmt(p.price * qty)}</span>
        </div>
      `;
    }).join('');
    el('#cartItems').querySelectorAll('.qty-btn').forEach((btn) => {
      btn.addEventListener('click', () => changeQty(btn.dataset.id, Number(btn.dataset.delta)));
    });
  }

  el('#cartTotal').textContent = fmt(cartTotal());
  el('#checkoutBtn').disabled = entries.length === 0;
}

function openCart() {
  el('#cartDrawer').classList.add('open');
  el('#scrim').hidden = false;
}
function closeCart() {
  el('#cartDrawer').classList.remove('open');
  el('#scrim').hidden = true;
}

function getEmail() {
  const email = el('#checkoutEmail').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    showBanner('Enter a valid email address for your receipt.', true);
    return null;
  }
  return email;
}

async function checkoutCard() {
  const items = Object.entries(state.cart).map(([id, quantity]) => ({ id, quantity }));
  if (items.length === 0) return;
  const email = getEmail();
  if (!email) return;

  setCheckoutBusy('REDIRECTING…');

  try {
    const res = await fetch('/api/paystack-initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, items }),
    });
    const data = await res.json();
    if (!res.ok || !data.authorizationUrl) throw new Error(data.error || 'Checkout failed');
    window.location.href = data.authorizationUrl;
  } catch (err) {
    showBanner(`Couldn't start checkout: ${err.message}`, true);
    resetCheckoutBtn();
  }
}

async function checkoutMpesa() {
  const items = Object.entries(state.cart).map(([id, quantity]) => ({ id, quantity }));
  if (items.length === 0) return;
  const email = getEmail();
  if (!email) return;

  const phone = el('#mpesaPhone').value.trim();
  if (!/^254[17]\d{8}$/.test(phone)) {
    showBanner('Enter your Safaricom number as 2547XXXXXXXX.', true);
    return;
  }

  setCheckoutBusy('SENDING PROMPT…');

  try {
    const res = await fetch('/api/paystack-mpesa-charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, items }),
    });
    const data = await res.json();
    if (!res.ok || !data.reference) throw new Error(data.error || 'Could not start M-Pesa payment.');
    showBanner('Check your phone and enter your M-Pesa PIN to complete payment…');
    pollPaymentStatus(data.reference, 0);
  } catch (err) {
    showBanner(err.message, true);
    resetCheckoutBtn();
  }
}

async function pollPaymentStatus(reference, attempt) {
  if (attempt > 20) {
    showBanner('Still waiting on confirmation. Check your phone, or try again.', true);
    resetCheckoutBtn();
    return;
  }
  try {
    const res = await fetch(`/api/paystack-status?reference=${encodeURIComponent(reference)}`);
    const data = await res.json();
    if (data.status === 'success') {
      state.cart = {};
      saveCart();
      renderCartUI();
      showBanner('Payment received — thank you for your order.');
      resetCheckoutBtn();
      closeCart();
    } else if (data.status === 'failed') {
      showBanner(`Payment not completed: ${data.gatewayResponse || 'cancelled or timed out'}.`, true);
      resetCheckoutBtn();
    } else {
      setTimeout(() => pollPaymentStatus(reference, attempt + 1), 3000);
    }
  } catch {
    setTimeout(() => pollPaymentStatus(reference, attempt + 1), 3000);
  }
}

function setCheckoutBusy(label) {
  el('#checkoutBtn').disabled = true;
  el('#checkoutBtn').textContent = label;
}
function resetCheckoutBtn() {
  el('#checkoutBtn').disabled = false;
  el('#checkoutBtn').textContent = 'CHECKOUT →';
}

function checkout() {
  if (state.paymentMethod === 'mpesa') checkoutMpesa();
  else checkoutCard();
}

function showBanner(msg, isError) {
  const b = el('#banner');
  b.textContent = msg;
  b.hidden = false;
  b.className = 'banner' + (isError ? ' error' : '');
}

async function handleReturnStatus() {
  const params = new URLSearchParams(window.location.search);
  const reference = params.get('reference') || params.get('trxref');
  if (!reference) return;

  showBanner('Confirming your payment…');
  try {
    const res = await fetch(`/api/paystack-status?reference=${encodeURIComponent(reference)}`);
    const data = await res.json();
    if (data.status === 'success') {
      state.cart = {};
      saveCart();
      renderCartUI();
      showBanner('Payment received — thank you for your order.');
    } else if (data.status === 'failed') {
      showBanner('Payment was not completed — your cart is still saved.', true);
    } else {
      showBanner('Still confirming your payment — refresh in a moment if this doesn\'t update.', true);
    }
  } catch {
    showBanner('Could not confirm payment status — check your email for a receipt.', true);
  }
  // Clean the URL so a page refresh doesn't re-trigger this check.
  window.history.replaceState({}, '', window.location.pathname);
}

async function init() {
  const res = await fetch('products.json');
  state.products = await res.json();
  renderCategoryNav();
  renderCatalog();
  renderCartUI();
  handleReturnStatus();

  el('#cartToggle').addEventListener('click', openCart);
  el('#cartClose').addEventListener('click', closeCart);
  el('#scrim').addEventListener('click', closeCart);
  el('#checkoutBtn').addEventListener('click', checkout);

  document.querySelectorAll('.pm-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.paymentMethod = btn.dataset.method;
      document.querySelectorAll('.pm-btn').forEach((b) => b.classList.toggle('active', b === btn));
      el('#mpesaPhoneWrap').hidden = state.paymentMethod !== 'mpesa';
      el('#cartNote').textContent = state.paymentMethod === 'mpesa'
        ? 'You will get a payment prompt on your phone'
        : 'Secure payment via Stripe Checkout';
    });
  });
}

init();
