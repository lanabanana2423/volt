// src/api.js
const TOKEN_KEY = "token";
const DEFAULT_TIMEOUT_MS = 8000;

export function normalizePhone(input) {
  return String(input || "").trim().replace(/\D+/g, "");
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function mapErrorMessage(codeOrMsg, status) {
  const code = String(codeOrMsg || "");
  if (code === "PHONE_EXISTS") return "Номер уже зарегистрирован";
  if (code === "INVALID_CREDENTIALS") return "Неверный телефон или пароль";
  if (code === "exists") return "Такая категория уже есть";
  if (code === "forbidden" || status === 403) return "Недостаточно прав";
  if (
    code === "phone/password required" ||
    code === "phone/password/nickname required"
  )
    return "Заполните все поля";
  if (code === "NO_TOKEN" || code === "BAD_TOKEN" || status === 401)
    return "Сессия истекла. Войдите снова.";
  if (code === "timeout") return "Сервер не отвечает. Попробуйте ещё раз.";
  return "Ошибка. Попробуйте ещё раз.";
}

async function apiFetch(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(path, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) setToken(null);
      const errCode = data?.error || data?.message || "request failed";
      const err = new Error(mapErrorMessage(errCode, res.status));
      err.code = errCode;
      err.status = res.status;
      throw err;
    }

    return data;
  } catch (e) {
    if (e?.name === "AbortError") {
      const err = new Error(mapErrorMessage("timeout", 0));
      err.code = "timeout";
      err.status = 0;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export const api = {
  async register({ phone, password, nickname }) {
    return apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        phone: normalizePhone(phone),
        password,
        nickname,
      }),
    });
  },

  async login({ phone, password }) {
    return apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        phone: normalizePhone(phone),
        password,
      }),
    });
  },

  async me() {
    return apiFetch("/api/me");
  },

  async logout() {
    setToken(null);
    return { ok: true };
  },

  async updateProfile({ name, address }) {
    return apiFetch("/api/me", {
      method: "PUT",
      body: JSON.stringify({ name, address }),
    });
  },

  async getCategories() {
    return apiFetch("/api/categories");
  },

  async getProducts() {
    return apiFetch("/api/products");
  },

  async createOrder(payload) {
    return apiFetch("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getMyOrders() {
    return apiFetch("/api/orders");
  },

  async getAllOrders() {
    return apiFetch("/api/admin/orders");
  },

  async setOrderStatus(id, status) {
    return apiFetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  async addCategory(name) {
    return apiFetch("/api/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async deleteCategory(name) {
    return apiFetch(`/api/admin/categories/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  },

  async createProduct(payload) {
    return apiFetch("/api/admin/products", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateProduct(id, payload) {
    return apiFetch(`/api/admin/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async deleteProduct(id) {
    return apiFetch(`/api/admin/products/${id}`, {
      method: "DELETE",
    });
  },

  async listCategories() {
    return api.getCategories();
  },
  async listProducts() {
    return api.getProducts();
  },
  async listOrders() {
    return api.getMyOrders();
  },
  async adminListOrders() {
    return api.getAllOrders();
  },
  async adminUpdateOrder(id, status) {
    return api.setOrderStatus(id, status);
  },
  async adminAddCategory(name) {
    return api.addCategory(name);
  },
  async adminDeleteCategory(name) {
    return api.deleteCategory(name);
  },
  async adminAddProduct(payload) {
    return api.createProduct(payload);
  },
  async adminUpdateProduct(id, payload) {
    return api.updateProduct(id, payload);
  },
  async adminDeleteProduct(id) {
    return api.deleteProduct(id);
  },

  // ===== BANNERS =====
  async getBanners() {
    return apiFetch("/api/banners");
  },
  async addBanner(imageBase64) {
    return apiFetch("/api/admin/banners", {
      method: "POST",
      body: JSON.stringify({ image: imageBase64 }),
    });
  },
  async deleteBanner(id) {
    return apiFetch(`/api/admin/banners/${id}`, {
      method: "DELETE",
    });
  },
};
