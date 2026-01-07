import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ShoppingCart,
  User,
  Home,
  Plus,
  Edit2,
  Trash2,
  X,
  Grid3x3,
  Search,
  ChevronLeft,
  ChevronRight,
  Minus,
  Check,
  RefreshCw,
} from "lucide-react";
import "./styles.css";
import { api, setToken } from "./api";

/**
 * Telegram Mini App init
 */
const tg = window.Telegram?.WebApp;
try {
  tg?.ready();
  tg?.expand();
} catch {}

/* =======================
   Network helpers (to avoid Telegram mobile hangs)
======================= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (promise, ms = 8000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);

/**
 * local storage helper (только для корзины)
 */
if (!window.storage) {
  window.storage = {
    async get(key) {
      const v = localStorage.getItem(key);
      return v === null ? null : { value: v };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
    },
    async delete(key) {
      localStorage.removeItem(key);
    },
  };
}

/** utils */
const cartKeyFor = (user) => (user?.phone ? `cart:${user.phone}` : "cart:guest");

const normalizeProduct = (p) => {
  const images =
    Array.isArray(p.images) && p.images.length ? p.images : p.image ? [p.image] : [];
  // выкидываем мусорные поля если были
  const { image, reviews, rating, ...rest } = p;
  return { ...rest, images };
};

const priceToNumber = (p) => parseFloat(String(p).replace(",", ".")) || 0;

const getProductById = (products, id) => products.find((p) => p.id === id);

const calcCartTotal = (cart, products) =>
  cart
    .reduce((sum, row) => {
      const product = getProductById(products, row.productId);
      if (!product) return sum;
      return sum + priceToNumber(product.price) * (row.qty || 0);
    }, 0)
    .toFixed(2);

const cartCountTotal = (cart) => cart.reduce((s, r) => s + (r.qty || 0), 0);

const STATUS_META = {
  new: { label: "Новый", badge: "bg-gray-100 text-gray-700 border-gray-200" },
  in_work: { label: "В работе", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  done: { label: "Готово", badge: "bg-lime-50 text-lime-800 border-lime-200" },
  canceled: { label: "Отменён", badge: "bg-red-50 text-red-700 border-red-200" },
};

const StatusBadge = ({ status }) => {
  const meta =
    STATUS_META[status] || {
      label: String(status || ""),
      badge: "bg-gray-100 text-gray-700 border-gray-200",
    };
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-extrabold border ${meta.badge}`}
    >
      {meta.label}
    </span>
  );
};

const PAGE_SIZE = 5;

const TinySpinner = () => (
  <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
);

/** UI */
const SuccessNotification = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    // ✅ всегда поверх модалок логина/форм
    <div className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-scale-in">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-lime-500 rounded-full flex items-center justify-center mb-4 checkmark-circle">
            <Check className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-2xl font-extrabold text-gray-800 mb-2">Готово</h3>
          <p className="text-gray-600 text-center">{message}</p>
        </div>
      </div>
    </div>
  );
};

const SwipeGallery = ({ images = [] }) => {
  const [idx, setIdx] = useState(0);
  const startX = useRef(null);

  useEffect(() => {
    setIdx(0);
  }, [images?.join("|")]);

  if (!images.length) {
    return (
      <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
        Нет фото
      </div>
    );
  }

  const prev = () => setIdx((v) => (v - 1 + images.length) % images.length);
  const next = () => setIdx((v) => (v + 1) % images.length);

  const onTouchStart = (e) => {
    startX.current = e.touches?.[0]?.clientX ?? null;
  };

  const onTouchEnd = (e) => {
    if (startX.current == null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? null;
    if (endX == null) return;
    const dx = endX - startX.current;
    startX.current = null;

    if (Math.abs(dx) < 40) return;
    if (dx > 0) prev();
    else next();
  };

  return (
    <div className="relative">
      <div
        className="w-full h-64 overflow-hidden rounded-lg bg-gray-100"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={images[idx]}
          alt={`photo-${idx + 1}`}
          className="w-full h-64 object-cover transition-transform duration-300"
          draggable={false}
        />
      </div>

      {images.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 p-2 rounded-full shadow hover:scale-110 transition-transform"
            aria-label="prev"
            type="button"
          >
            <ChevronLeft size={20} />
          </button>

          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 p-2 rounded-full shadow hover:scale-110 transition-transform"
            aria-label="next"
            type="button"
          >
            <ChevronRight size={20} />
          </button>

          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
            {images.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                  i === idx ? "bg-white w-4" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Header — ✅ 1 ряд: логотип -> поиск -> корзина
 */
const Header = React.memo(function Header({
  cartCount,
  searchTerm,
  onSearchChange,
  onCart,
}) {
  const logoSrc = `${import.meta.env.BASE_URL}uploads/logo.jpg`;

  return (
    <div className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
          <img
            src={logoSrc}
            alt="logo"
            className="w-full h-full object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        </div>

        <div className="flex-1 min-w-0 relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Поиск..."
            className="w-full pl-10 pr-3 py-2 rounded-2xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-lime-300"
          />
        </div>

        <button
          onClick={onCart}
          className="relative h-10 w-10 rounded-2xl border border-gray-200 bg-white flex items-center justify-center hover:scale-105 transition-transform shrink-0"
          type="button"
          aria-label="cart"
        >
          <ShoppingCart size={18} />
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-lime-500 text-white text-[10px] font-extrabold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
});

/**
 * Bottom nav: 3 кнопки (без корзины)
 */
const BottomNav = React.memo(function BottomNav({ page, setPage }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className="max-w-md mx-auto bg-white border-t border-gray-200">
        <div className="grid grid-cols-3">
          <button
            onClick={() => setPage("home")}
            className={`py-3 flex flex-col items-center gap-1 ${
              page === "home" ? "text-lime-700" : "text-gray-500"
            }`}
            type="button"
          >
            <Home size={20} />
            <span className="text-[11px] font-bold">Главная</span>
          </button>

          <button
            onClick={() => setPage("catalog")}
            className={`py-3 flex flex-col items-center gap-1 ${
              page === "catalog" ? "text-lime-700" : "text-gray-500"
            }`}
            type="button"
          >
            <Grid3x3 size={20} />
            <span className="text-[11px] font-bold">Каталог</span>
          </button>

          <button
            onClick={() => setPage("profile")}
            className={`py-3 flex flex-col items-center gap-1 ${
              page === "profile" ? "text-lime-700" : "text-gray-500"
            }`}
            type="button"
          >
            <User size={20} />
            <span className="text-[11px] font-bold">Профиль</span>
          </button>
        </div>
      </div>
    </div>
  );
});

const Pager = ({ page, totalItems, pageSize = PAGE_SIZE, onPrev, onNext }) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  return (
    <div className="mt-3 flex items-center justify-between">
      <button
        onClick={onPrev}
        disabled={page <= 1}
        className="px-3 py-2 rounded-xl border border-gray-200 bg-white font-bold text-sm disabled:opacity-50"
        type="button"
      >
        Назад
      </button>

      <div className="text-xs text-gray-500 font-bold">
        {page} / {totalPages}
      </div>

      <button
        onClick={onNext}
        disabled={page >= totalPages}
        className="px-3 py-2 rounded-xl border border-gray-200 bg-white font-bold text-sm disabled:opacity-50"
        type="button"
      >
        Вперёд
      </button>
    </div>
  );
};


/** ✅ Красивый выбор нескольких категорий (без Ctrl/⌘) */
const CategoryMultiSelect = ({ options = [], value = [], onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  const selected = Array.isArray(value) ? value : [];
  const filtered = (options || []).filter((c) =>
    String(c || "").toLowerCase().includes(q.trim().toLowerCase())
  );

  useEffect(() => {
    const onDoc = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, []);

  const toggle = (cat) => {
    const next = selected.includes(cat)
      ? selected.filter((x) => x !== cat)
      : [...selected, cat];
    onChange?.(next);
  };

  const remove = (cat) => onChange?.(selected.filter((x) => x !== cat));

  return (
    <div className="mb-3" ref={ref}>
      <div className="text-sm font-bold text-gray-900 mb-2">Категории</div>

      <button
        type="button"
        className="multiselect-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="multiselect-chips">
          {selected.length ? (
            selected.map((c) => (
              <span key={c} className="multiselect-chip">
                <span className="multiselect-chip-text">{c}</span>
                <span
                  className="multiselect-chip-x"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(c);
                  }}
                  role="button"
                  aria-label="remove"
                >
                  <X size={14} />
                </span>
              </span>
            ))
          ) : (
            <span className="multiselect-placeholder">Выбери 1–несколько категорий</span>
          )}
        </div>

        <span className={`multiselect-caret ${open ? "is-open" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="multiselect-popover">
          <div className="multiselect-search">
            <Search size={16} className="multiselect-search-ico" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск категории..."
              className="multiselect-search-input"
            />
          </div>

          <div className="multiselect-list">
            {filtered.length === 0 ? (
              <div className="multiselect-empty">Ничего не найдено</div>
            ) : (
              filtered.map((c) => {
                const checked = selected.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    className={`multiselect-item ${checked ? "is-checked" : ""}`}
                    onClick={() => toggle(c)}
                  >
                    <span className={`multiselect-check ${checked ? "is-checked" : ""}`}>
                      {checked ? <Check size={16} /> : null}
                    </span>
                    <span className="multiselect-item-text">{c}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="multiselect-footer">
            <button
              type="button"
              className="multiselect-clear"
              onClick={() => onChange?.([])}
              disabled={!selected.length}
            >
              Очистить
            </button>
            <button type="button" className="multiselect-done" onClick={() => setOpen(false)}>
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
};




/** =======================
   Banner carousel
======================= */
const BannerCarousel = ({ banners = [] }) => {
  const list = Array.isArray(banners) ? banners : [];
  const [idx, setIdx] = useState(0);
  const startX = useRef(null);

  useEffect(() => {
    setIdx(0);
  }, [list.length]);

  useEffect(() => {
    if (list.length <= 1) return;
    const t = setInterval(() => {
      setIdx((v) => (v + 1) % list.length);
    }, 3000);
    return () => clearInterval(t);
  }, [list.length]);

  if (!list.length) return null;

  const prev = () => setIdx((v) => (v - 1 + list.length) % list.length);
  const next = () => setIdx((v) => (v + 1) % list.length);

  const onTouchStart = (e) => {
    startX.current = e.touches?.[0]?.clientX ?? null;
  };
  const onTouchEnd = (e) => {
    if (startX.current == null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? null;
    if (endX == null) return;
    const dx = endX - startX.current;
    startX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx > 0) prev();
    else next();
  };

  const current = list[idx];
  const src = current?.image || current?.src || current?.url || "";

  return (
    <div className="banner-wrap">
      <div className="banner-inner" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img
          src={src}
          alt="banner"
          className="banner-img"
          onError={(e) => (e.currentTarget.style.display = "none")}
          draggable={false}
        />
      </div>

      {list.length > 1 && (
        <>
          <button className="banner-nav banner-prev" onClick={prev} type="button" aria-label="prev">
            <ChevronLeft size={18} />
          </button>
          <button className="banner-nav banner-next" onClick={next} type="button" aria-label="next">
            <ChevronRight size={18} />
          </button>

          <div className="banner-dots">
            {list.map((_, i) => (
              <span key={i} className={`banner-dot ${i === idx ? "is-active" : ""}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const AdminBannersModal = ({ banners = [], onClose, onAdd, onDelete, adding }) => {
  const [file, setFile] = useState(null);

  const handleAdd = () => {
    if (!file || adding) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await onAdd?.(reader.result);
        setFile(null);
      } catch (e) {
        // parent shows notification
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-overlay">
      <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl sm:rounded-3xl p-4 max-h-[90vh] overflow-y-auto hide-scrollbar modal-content">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-extrabold text-gray-900">Баннеры</h3>
          <button onClick={onClose} className="p-2 hover:rotate-90 transition-transform" type="button">
            <X size={22} />
          </button>
        </div>

        <div className="mb-4">
          <div className="text-sm font-bold text-gray-900 mb-2">Добавить баннер</div>

          <div className="file-upload">
            <input
              id="banner-file"
              className="file-upload-input"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={adding}
            />
            <label htmlFor="banner-file" className="file-upload-btn">
              Выбрать файл
            </label>
            <span className="file-upload-hint">
              {file ? file.name : "Файл не выбран"}
            </span>
          </div>

          <button
            className="mt-3 w-full bg-gradient-to-r from-lime-500 to-green-500 text-white py-3 rounded-xl font-extrabold disabled:opacity-50 hover:scale-105 transition-transform"
            type="button"
            onClick={handleAdd}
            disabled={!file || adding}
          >
            {adding ? "Добавляем..." : "Добавить"}
          </button>

          <div className="text-xs text-gray-500 mt-2">
            PNG/JPG, лучше широкий баннер.
          </div>
        </div>

        <div className="text-sm font-extrabold text-gray-900 mb-2">Текущие</div>
        {banners.length === 0 ? (
          <div className="text-sm text-gray-500">Баннеров пока нет</div>
        ) : (
          <div className="space-y-3">
            {banners.map((b) => (
              <div key={b.id} className="border border-gray-200 rounded-2xl p-3 flex items-center gap-3">
                <div className="banner-thumb">
                  <img src={b.image} alt="banner" className="banner-thumb-img" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 font-bold">ID: {b.id}</div>
                </div>
                <button
                  onClick={() => onDelete?.(b.id)}
                  className="text-sm font-bold text-red-600 bg-red-50 px-3 py-2 rounded-xl hover:scale-105 transition-transform"
                  type="button"
                  disabled={adding}
                >
                  <span className="inline-flex items-center gap-1">
                    <Trash2 size={16} /> Удалить
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const OrderDetailsModal = ({ order, onClose }) => {
  if (!order) return null;

  const info = order.order_info || {};
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-overlay">
      <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl sm:rounded-3xl p-4 max-h-[90vh] overflow-y-auto hide-scrollbar modal-content">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-xl font-extrabold text-gray-900">
              Заказ #{order.id}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={order.status} />
              <div className="text-xs text-gray-500 font-bold">
                {order.created_at
                  ? new Date(order.created_at).toLocaleString("ru-RU")
                  : ""}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:rotate-90 transition-transform"
            type="button"
          >
            <X size={22} />
          </button>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3">
          <div className="text-sm font-extrabold text-gray-900 mb-2">
            Доставка
          </div>
          <div className="text-sm text-gray-800">
            <b>Имя:</b> {info.name || "—"}
          </div>
          <div className="text-sm text-gray-800">
            <b>Телефон:</b> {info.phone || "—"}
          </div>
          <div className="text-sm text-gray-800">
            <b>Адрес:</b> {info.address || "—"}
          </div>
          {info.comment ? (
            <div className="text-sm text-gray-800 mt-1">
              <b>Комментарий:</b> {info.comment}
            </div>
          ) : null}
        </div>

        <div className="mt-3 border border-gray-200 rounded-2xl p-3">
          <div className="text-sm font-extrabold text-gray-900 mb-2">
            Состав заказа
          </div>
          {items.length === 0 ? (
            <div className="text-sm text-gray-500">Нет данных</div>
          ) : (
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gray-900 truncate">
                      {it.name || "Товар"}
                    </div>
                    {it.price != null ? (
                      <div className="text-xs text-gray-500">{it.price} BYN</div>
                    ) : null}
                  </div>
                  <div className="text-sm font-extrabold text-gray-900 whitespace-nowrap">
                    x{it.qty || 1}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm font-extrabold text-gray-900">Итого</div>
            <div className="text-sm font-extrabold text-lime-700">
              {order.total} BYN
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const HomePage = React.memo(function HomePage({
  currentUser,
  products,
  filteredProducts,
  productsLoading,
  getQtyInCart,
  addToCartPending,
  onOpenCatalog,
  onSelectProduct,
  onAddToCart,
  onEdit,
  onDelete,
}) {
  return (
    <div className="p-4 pb-20">
      <div className="mt-2 flex items-center justify-between">
        <h2 className="text-2xl font-extrabold text-gray-900">Товары</h2>
        <button
          onClick={onOpenCatalog}
          className="text-sm font-semibold text-lime-700 hover:scale-110 transition-transform"
          type="button"
        >
          Категории
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {filteredProducts.map((product) => {
          const qty = getQtyInCart(product.id);
          const isPending = !!addToCartPending[product.id];

          return (
            <div
              key={product.id}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden product-card cursor-pointer"
              onClick={() => onSelectProduct(product)}
            >
              <div className="w-full h-36 bg-gray-100">
                <img
                  src={(product.images && product.images[0]) || ""}
                  alt={product.name}
                  className="w-full h-36 object-cover"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              </div>

              <div className="p-3">
                <div className="font-extrabold text-gray-900 text-sm line-clamp-2">
                  {product.name}
                </div>

                {/* 2 строки описания, без категории */}
                {product.description ? (
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {product.description}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 mt-1 line-clamp-2"> </div>
                )}

                <div className="product-bottom flex items-center justify-between gap-2 pt-2">
                  <div className="text-left">
                    <div className="text-lime-600 font-extrabold text-sm whitespace-nowrap">
                      {product.price} BYN
                    </div>
                    {product.oldPrice && (
                      <div className="text-gray-400 text-xs line-through whitespace-nowrap">
                        {product.oldPrice} BYN
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToCart(product);
                    }}
                    disabled={!currentUser || isPending}
                    className={`h-10 w-10 rounded-xl flex items-center justify-center shadow-sm transition-transform ${
                      !currentUser
                        ? "bg-gray-200 text-gray-500"
                        : qty > 0
                        ? "bg-lime-50 text-lime-700 border border-lime-200"
                        : "bg-lime-500 text-white hover:scale-105"
                    } disabled:opacity-60`}
                    type="button"
                    aria-label="add-to-cart"
                    title={!currentUser ? "Нужно войти" : "Добавить"}
                  >
                    {qty > 0 ? <Check size={18} /> : <ShoppingCart size={18} />}
                  </button>
                </div>

                {currentUser?.isAdmin && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(product);
                      }}
                      className="flex-1 text-xs font-bold bg-blue-50 text-blue-700 rounded-xl py-2 hover:scale-105 transition-transform"
                      type="button"
                    >
                      <span className="inline-flex items-center gap-1 justify-center">
                        <Edit2 size={14} /> Редакт.
                      </span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(product.id);
                      }}
                      className="flex-1 text-xs font-bold bg-red-50 text-red-700 rounded-xl py-2 hover:scale-105 transition-transform"
                      type="button"
                    >
                      <span className="inline-flex items-center gap-1 justify-center">
                        <Trash2 size={14} /> Удалить
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {products.length === 0 && (
          <div className="col-span-2 text-center text-sm text-gray-500 py-8">
            {productsLoading ? "Загрузка товаров..." : "Товаров пока нет"}
          </div>
        )}
      </div>
    </div>
  );
});

const CatalogPage = React.memo(function CatalogPage({
  categories,
  products,
  currentUser,
  onPickCategory,
  onDeleteCategory,
  onBackAll,
}) {
  return (
    <div className="p-4 pb-20">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-extrabold text-gray-900">Каталог</h2>
        <button
          onClick={onBackAll}
          className="text-sm font-semibold text-lime-700 hover:scale-110 transition-transform"
          type="button"
        >
          Все товары
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {categories.map((category) => {
          const count = products.filter((p) => {
            const cats =
              Array.isArray(p.categories) && p.categories.length
                ? p.categories
                : [p.category].filter(Boolean);
            return cats.includes(category);
          }).length;

          return (
            <div
              key={category}
              onClick={() => onPickCategory(category)}
              className="bg-white rounded-2xl border border-gray-200 p-3 cursor-pointer hover:scale-[1.01] transition-transform"
            >
              <div className="text-sm font-bold text-gray-900 line-clamp-2">
                {category}
              </div>
              <div className="text-xs text-gray-500 mt-1">{count} товаров</div>

              {currentUser?.isAdmin && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCategory(category);
                  }}
                  className="mt-2 w-full text-xs font-semibold text-red-600 bg-red-50 rounded-xl py-1 hover:scale-105 transition-transform"
                  type="button"
                >
                  Удалить
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

const CartPage = React.memo(function CartPage({
  cart,
  products,
  orderForm,
  setOrderForm,
  currentUser,
  submittingOrder,
  onSubmitOrder,
  onInc,
  onSetQty,
}) {
  const total = calcCartTotal(cart, products);
  const rows = cart
    .map((r) => {
      const p = getProductById(products, r.productId);
      if (!p) return null;
      return { product: p, qty: r.qty };
    })
    .filter(Boolean);

  return (
    <div className="p-4 pb-20">
      <h2 className="text-2xl font-extrabold mb-4 text-gray-900">Корзина</h2>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-500">
          Корзина пуста
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {rows.map(({ product, qty }) => (
              <div
                key={product.id}
                className="bg-white rounded-2xl border border-gray-200 p-3 flex gap-3 items-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-gray-100 overflow-hidden">
                  <img
                    src={(product.images && product.images[0]) || ""}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-gray-900 truncate">
                    {product.name}
                  </div>
                  <div className="text-sm text-gray-500">{product.price} BYN</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onInc(product.id, -1)}
                    className="h-10 w-10 rounded-xl border border-gray-200 flex items-center justify-center hover:scale-110 transition-transform"
                    type="button"
                  >
                    <Minus size={18} />
                  </button>

                  <div className="w-8 text-center font-extrabold">{qty}</div>

                  <button
                    onClick={() => onInc(product.id, +1)}
                    className="h-10 w-10 rounded-xl border border-gray-200 flex items-center justify-center hover:scale-110 transition-transform"
                    type="button"
                  >
                    <Plus size={18} />
                  </button>

                  <button
                    onClick={() => onSetQty(product.id, 0)}
                    className="text-red-600 p-2 hover:scale-110 transition-transform"
                    type="button"
                    aria-label="remove"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 bg-white rounded-2xl border border-gray-200 p-4 shadow-lg">
            <div className="text-xl font-extrabold mb-4 text-gray-900">
              Итого: <span className="text-lime-700">{total} BYN</span>
            </div>

            <input
              type="text"
              placeholder="Имя"
              value={orderForm.name}
              onChange={(e) => setOrderForm({ ...orderForm, name: e.target.value })}
              className="w-full p-3 border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-lime-300"
            />

            <input
              type="tel"
              placeholder="Телефон"
              value={orderForm.phone}
              onChange={(e) => setOrderForm({ ...orderForm, phone: e.target.value })}
              className="w-full p-3 border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-lime-300"
            />

            <input
              type="text"
              placeholder="Адрес доставки"
              value={orderForm.address}
              onChange={(e) => setOrderForm({ ...orderForm, address: e.target.value })}
              className="w-full p-3 border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-lime-300"
            />

            <textarea
              placeholder="Комментарий к заказу"
              value={orderForm.comment}
              onChange={(e) => setOrderForm({ ...orderForm, comment: e.target.value })}
              className="w-full p-3 border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-lime-300"
              rows="3"
            />

            <button
              onClick={onSubmitOrder}
              disabled={
                submittingOrder || !orderForm.name || !orderForm.phone || !orderForm.address
              }
              className="w-full bg-gradient-to-r from-lime-500 to-green-500 text-white py-3 rounded-xl font-extrabold disabled:opacity-50 hover:scale-105 transition-transform"
              type="button"
            >
              {submittingOrder ? "Оформляем..." : "Оформить заказ"}
            </button>

            {!currentUser && (
              <div className="text-xs text-gray-500 mt-2">
                Чтобы оформить заказ — нужно войти.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});

const ProfilePage = React.memo(function ProfilePage({
  currentUser,
  userOrders,
  adminOrders,
  orderStatusPending,
  userOrdersRefreshing,
  adminOrdersRefreshing,
  userOrdersPage,
  setUserOrdersPage,
  adminHistoryPage,
  setAdminHistoryPage,
  onRefreshUserOrders,
  onRefreshAdminOrders,
  onAdminSetStatus,
  onLogout,
  onOpenAuth,
  onOpenOrderDetails,
}) {
  const isAdmin = !!currentUser?.isAdmin;

  const activeAdmin = adminOrders.filter((o) => o.status === "new" || o.status === "in_work");
  const historyAdmin = adminOrders.filter((o) => o.status === "done" || o.status === "canceled");

  const userSliceFrom = (userOrdersPage - 1) * PAGE_SIZE;
  const userSliceTo = userSliceFrom + PAGE_SIZE;
  const userOrdersPaged = userOrders.slice(userSliceFrom, userSliceTo);

  const adminHistFrom = (adminHistoryPage - 1) * PAGE_SIZE;
  const adminHistTo = adminHistFrom + PAGE_SIZE;
  const historyAdminPaged = historyAdmin.slice(adminHistFrom, adminHistTo);

  const isPending = (orderId) => !!orderStatusPending?.[orderId];

  return (
    <div className="p-4 pb-20">
      <h2 className="text-2xl font-extrabold mb-4 text-gray-900">Профиль</h2>

      {currentUser ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-lime-100 flex items-center justify-center text-lime-800 font-extrabold">
                {String(currentUser.nickname || "U").slice(0, 1).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-gray-900 truncate">
                  {currentUser.nickname}
                </div>
                <div className="text-sm text-gray-500 truncate">{currentUser.phone}</div>
              </div>

              {isAdmin && (
                <div className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                  Админ
                </div>
              )}
            </div>
          </div>

          {/* ✅ "Мои заказы" только у обычных */}
          {!isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-extrabold text-gray-900">Мои заказы</div>

                {/* ✅ кнопка-иконка с крутилкой */}
                <button
                  onClick={() => {
                    setUserOrdersPage(1);
                    onRefreshUserOrders();
                  }}
                  disabled={userOrdersRefreshing}
                  className="h-9 w-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-60 disabled:hover:scale-100"
                  type="button"
                  aria-label="refresh-user-orders"
                  title="Обновить"
                >
                  <RefreshCw size={18} className={userOrdersRefreshing ? "animate-spin" : ""} />
                </button>
              </div>

              {userOrders.length === 0 ? (
                <div className="text-sm text-gray-500">Заказов пока нет</div>
              ) : (
                <>
                  <div className="space-y-2">
                    {userOrdersPaged.map((o) => (
                      <div key={o.id} className="border border-gray-200 rounded-2xl p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-extrabold text-gray-900">Заказ #{o.id}</div>
                          <StatusBadge status={o.status} />
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {o.created_at ? new Date(o.created_at).toLocaleString("ru-RU") : ""}
                        </div>
                        <div className="text-sm font-bold text-lime-700 mt-1">{o.total} BYN</div>
                      </div>
                    ))}
                  </div>

                  <Pager
                    page={userOrdersPage}
                    totalItems={userOrders.length}
                    onPrev={() => setUserOrdersPage((p) => Math.max(1, p - 1))}
                    onNext={() =>
                      setUserOrdersPage((p) =>
                        Math.min(Math.ceil(userOrders.length / PAGE_SIZE), p + 1)
                      )
                    }
                  />
                </>
              )}
            </div>
          )}

          {/* Админские заказы */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-extrabold text-gray-900">Заказы (админ)</div>

                {/* ✅ кнопка-иконка с крутилкой */}
                <button
                  onClick={() => {
                    setAdminHistoryPage(1);
                    onRefreshAdminOrders();
                  }}
                  disabled={adminOrdersRefreshing}
                  className="h-9 w-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-60 disabled:hover:scale-100"
                  type="button"
                  aria-label="refresh-admin-orders"
                  title="Обновить"
                >
                  <RefreshCw size={18} className={adminOrdersRefreshing ? "animate-spin" : ""} />
                </button>
              </div>

              <div className="text-sm font-extrabold text-gray-900 mb-2">Активные</div>

              {activeAdmin.length === 0 ? (
                <div className="text-sm text-gray-500">Нет активных заказов</div>
              ) : (
                <div className="space-y-2">
                  {activeAdmin.map((o) => {
                    const pending = isPending(o.id);

                    return (
                      <div
                        key={o.id}
                        className="w-full text-left border border-gray-200 rounded-2xl p-3 bg-white"
                      >
                        {/* Кликабельная область заказа (анимация только тут) */}
                        <button
                          onClick={() => onOpenOrderDetails(o)}
                          className="w-full text-left hover:bg-gray-50 transition-colors rounded-2xl p-0 active:scale-[0.99] focus:outline-none"
                          type="button"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-extrabold text-gray-900">Заказ #{o.id}</div>
                            <StatusBadge status={o.status} />
                          </div>

                          <div className="text-xs text-gray-500 mt-1">
                            {o.order_info?.name || o.order_info?.nickname || "—"} ·{" "}
                            {o.order_info?.phone || "—"}
                          </div>

                          <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                            {o.order_info?.address ? `Адрес: ${o.order_info.address}` : "Адрес: —"}
                          </div>

                          <div className="text-sm font-bold text-lime-700 mt-1">{o.total} BYN</div>
                        </button>

                        {/* Кнопки статуса — с загрузкой */}
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <button
                            onClick={() => onAdminSetStatus(o.id, "in_work")}
                            disabled={pending}
                            className="py-2 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs hover:scale-105 transition-transform disabled:opacity-60 disabled:hover:scale-100"
                            type="button"
                          >
                            <span className="inline-flex items-center gap-2 justify-center">
                              {pending ? <TinySpinner /> : null}
                              {pending ? "..." : "В работу"}
                            </span>
                          </button>

                          <button
                            onClick={() => onAdminSetStatus(o.id, "done")}
                            disabled={pending}
                            className="py-2 rounded-xl bg-lime-50 text-lime-800 font-bold text-xs hover:scale-105 transition-transform disabled:opacity-60 disabled:hover:scale-100"
                            type="button"
                          >
                            <span className="inline-flex items-center gap-2 justify-center">
                              {pending ? <TinySpinner /> : null}
                              {pending ? "..." : "Готово"}
                            </span>
                          </button>

                          <button
                            onClick={() => onAdminSetStatus(o.id, "canceled")}
                            disabled={pending}
                            className="py-2 rounded-xl bg-red-50 text-red-700 font-bold text-xs hover:scale-105 transition-transform disabled:opacity-60 disabled:hover:scale-100"
                            type="button"
                          >
                            <span className="inline-flex items-center gap-2 justify-center">
                              {pending ? <TinySpinner /> : null}
                              {pending ? "..." : "Отмена"}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="text-sm font-extrabold text-gray-900 mt-6 mb-2">История</div>
              {historyAdmin.length === 0 ? (
                <div className="text-sm text-gray-500">История пуста</div>
              ) : (
                <>
                  <div className="space-y-2">
                    {historyAdminPaged.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => onOpenOrderDetails(o)}
                        className="w-full text-left border border-gray-200 rounded-2xl p-3 hover:bg-gray-50 transition-colors"
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-extrabold text-gray-900">Заказ #{o.id}</div>
                          <StatusBadge status={o.status} />
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {o.created_at ? new Date(o.created_at).toLocaleString("ru-RU") : ""}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                          {o.order_info?.address ? `Адрес: ${o.order_info.address}` : "Адрес: —"}
                        </div>
                        <div className="text-sm font-bold text-lime-700 mt-1">{o.total} BYN</div>
                      </button>
                    ))}
                  </div>

                  <Pager
                    page={adminHistoryPage}
                    totalItems={historyAdmin.length}
                    onPrev={() => setAdminHistoryPage((p) => Math.max(1, p - 1))}
                    onNext={() =>
                      setAdminHistoryPage((p) =>
                        Math.min(Math.ceil(historyAdmin.length / PAGE_SIZE), p + 1)
                      )
                    }
                  />
                </>
              )}
            </div>
          )}

          <button
            onClick={onLogout}
            className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-3 rounded-xl font-extrabold hover:scale-105 transition-transform"
            type="button"
          >
            Выйти
          </button>
        </div>
      ) : (
        <div className="text-center">
          <button
            onClick={onOpenAuth}
            className="bg-gradient-to-r from-lime-500 to-green-500 text-white px-6 py-3 rounded-xl font-extrabold hover:scale-105 transition-transform"
            type="button"
          >
            Войти
          </button>
        </div>
      )}
    </div>
  );
});

const TelegramShop = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("home");

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);
  const [showBannersModal, setShowBannersModal] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState("all");

  const [searchTerm, setSearchTerm] = useState("");
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  const [cart, setCart] = useState([]);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("login");

  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [authForm, setAuthForm] = useState({ phone: "", password: "", nickname: "" });

  const [productForm, setProductForm] = useState({
    name: "",
    price: "",
    oldPrice: "",
    discount: "",
    description: "",
    category: "",
    categories: [],
    images: [],
  });

  const [orderForm, setOrderForm] = useState({
    name: "",
    phone: "",
    address: "",
    comment: "",
  });

  const [newCategory, setNewCategory] = useState("");

  const [userOrders, setUserOrders] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);

  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [savingProduct, setSavingProduct] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [addToCartPending, setAddToCartPending] = useState({}); // { [productId]: true }

  // ✅ загрузка статуса заказа по orderId
  const [orderStatusPending, setOrderStatusPending] = useState({}); // { [orderId]: true }

  // ✅ загрузка на кнопках обновления
  const [userOrdersRefreshing, setUserOrdersRefreshing] = useState(false);
  const [adminOrdersRefreshing, setAdminOrdersRefreshing] = useState(false);

  // пагинация
  const [userOrdersPage, setUserOrdersPage] = useState(1);
  const [adminHistoryPage, setAdminHistoryPage] = useState(1);

  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);

  const activeCartKey = useMemo(() => cartKeyFor(currentUser), [currentUser]);

  const saveCart = async (newCart) => {
    setCart(newCart);
    await window.storage.set(activeCartKey, JSON.stringify(newCart));
  };

  const migrateOldCartIfNeeded = async (key, parsed) => {
    if (Array.isArray(parsed) && parsed.length && parsed[0]?.productId === undefined) {
      const map = new Map();
      parsed.forEach((item) => {
        const id = item?.id;
        if (!id) return;
        map.set(id, (map.get(id) || 0) + 1);
      });
      const migrated = Array.from(map.entries()).map(([productId, qty]) => ({ productId, qty }));
      await window.storage.set(key, JSON.stringify(migrated));
      return migrated;
    }
    return Array.isArray(parsed) ? parsed : [];
  };

  const loadCartForCurrentUser = async (forcedUser = undefined) => {
    const u = forcedUser === undefined ? currentUser : forcedUser;
    const key = cartKeyFor(u);
    const cartData = await window.storage.get(key);

    if (cartData) {
      const parsed = JSON.parse(cartData.value);
      const migrated = await migrateOldCartIfNeeded(key, parsed);
      setCart(migrated);
      return;
    }

    const old = await window.storage.get("cart");
    if (old) {
      const oldParsed = JSON.parse(old.value);
      const migrated = await migrateOldCartIfNeeded(key, oldParsed);
      await window.storage.delete("cart");
      setCart(migrated);
      return;
    }

    setCart([]);
  };

  const fetchProfile = async () => {
    try {
      const { user } = await withTimeout(api.me(), 8000);
      return {
        id: user.id,
        phone: user.phone || "",
        nickname: user.nickname || user.phone || "User",
        name: user.name || "",
        address: user.address || "",
        isAdmin: !!user.isAdmin,
      };
    } catch {
      return null;
    }
  };

  const loadBanners = async () => {
    try {
      const { banners } = await withTimeout(api.getBanners(), 8000);
      setBanners(Array.isArray(banners) ? banners : []);
    } catch (e) {
      console.warn("loadBanners failed:", e);
      setBanners([]);
    }
  };


  const loadProductsAndCategories = async () => {
    setProductsLoading(true);
    try {
      const [{ categories: cats }, { products: prods }] = await withTimeout(
        Promise.all([api.getCategories(), api.getProducts()]),
        8000
      );

      // cats может быть массивом строк или объектов {name}
      const catNames = (cats || []).map((c) => (typeof c === "string" ? c : c.name));
      setCategories(catNames);

      const mapped = (prods || []).map((p) =>
        normalizeProduct({
          id: p.id,
          name: p.name,
          price: String(p.price ?? ""),
          oldPrice: p.old_price == null ? "" : String(p.old_price),
          discount: p.discount || "",
          description: p.description || "",
          category: p.category || "",
          categories: Array.isArray(p.categories) ? p.categories : [],
          images: Array.isArray(p.images) ? p.images : [],
        })
      );

      setProducts(mapped);
    } catch (e) {
      console.error("loadProductsAndCategories failed:", e);
      setProducts([]);
      setCategories([]);
    } finally {
      setProductsLoading(false);
    }
  };

  const loadUserOrders = async () => {
    if (!currentUser?.id) {
      setUserOrders([]);
      return;
    }
    const { orders } = await api.getMyOrders();
    setUserOrders(orders || []);
  };

  const loadAdminOrders = async () => {
    if (!currentUser?.isAdmin) {
      setAdminOrders([]);
      return;
    }
    const { orders } = await api.getAllOrders();
    setAdminOrders(orders || []);
  };

  // ✅ refresh wrappers (для иконки/крутилки)
  const refreshUserOrders = async () => {
    if (userOrdersRefreshing) return;
    setUserOrdersRefreshing(true);
    try {
      await loadUserOrders();
    } finally {
      setUserOrdersRefreshing(false);
    }
  };

  const refreshAdminOrders = async () => {
    if (adminOrdersRefreshing) return;
    setAdminOrdersRefreshing(true);
    try {
      await loadAdminOrders();
    } finally {
      setAdminOrdersRefreshing(false);
    }
  };

  const handleImagesUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    Promise.all(
      files.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
          })
      )
    ).then((base64s) => {
      setProductForm((prev) => ({ ...prev, images: [...prev.images, ...base64s] }));
    });
  };

  const removeProductImage = (index) => {
    setProductForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const handleSaveProduct = async () => {
    if (!currentUser?.isAdmin || savingProduct) return;

    setSavingProduct(true);
    try {
      const selectedCats = Array.isArray(productForm.categories) ? productForm.categories : [];
      const primaryCat = productForm.category || selectedCats[0] || null;

      const payload = {
        name: productForm.name || "",
        price: priceToNumber(productForm.price),
        old_price: productForm.oldPrice ? priceToNumber(productForm.oldPrice) : null,
        discount: productForm.discount || null,
        description: productForm.description || null,
        categories: selectedCats,
        category: primaryCat,
        images: Array.isArray(productForm.images) ? productForm.images : [],
      };

      if (editingProduct?.id) {
        await api.updateProduct(editingProduct.id, payload);
      } else {
        await api.createProduct(payload);
      }

      await loadProductsAndCategories();

      setShowProductModal(false);
      setProductForm({
        name: "",
        price: "",
        oldPrice: "",
        discount: "",
        description: "",
        category: "",
        categories: [],
        images: [],
      });
      setEditingProduct(null);

      setSuccessMessage(editingProduct ? "Товар обновлён" : "Товар добавлен");
      setShowSuccess(true);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name || "",
      price: product.price || "",
      oldPrice: product.oldPrice || "",
      discount: product.discount || "",
      description: product.description || "",
      category: product.category || "",
      categories: Array.isArray(product.categories) ? product.categories : [],
      images: Array.isArray(product.images) ? product.images : [],
    });
    setShowProductModal(true);
  };

  const handleDeleteProduct = async (productId) => {
    if (!currentUser?.isAdmin) return;
    await api.deleteProduct(productId);
    await loadProductsAndCategories();
    setSuccessMessage("Товар удалён");
    setShowSuccess(true);

    const cleanedCart = cart.filter((r) => r.productId !== productId);
    if (cleanedCart.length !== cart.length) await saveCart(cleanedCart);
  };

  const handleAddCategory = async () => {
    if (!currentUser?.isAdmin) return;
    const cat = newCategory.trim();
    if (!cat) return;

    await api.addCategory(cat);
    setNewCategory("");
    await loadProductsAndCategories();

    setSuccessMessage("Категория добавлена");
    setShowSuccess(true);
  };

  const handleAddBanner = async (base64) => {
    if (!currentUser?.isAdmin || bannerUploading) return;
    setBannerUploading(true);
    try {
      await api.addBanner(base64);
      await loadBanners();
      setSuccessMessage("Баннер добавлен");
      setShowSuccess(true);
    } catch (e) {
      console.error("addBanner failed:", e);
      setSuccessMessage(e?.message || "Не удалось добавить баннер");
      setShowSuccess(true);
    } finally {
      setBannerUploading(false);
    }
  };

  const handleDeleteBanner = async (id) => {
    if (!currentUser?.isAdmin || bannerUploading) return;
    setBannerUploading(true);
    try {
      await api.deleteBanner(id);
      await loadBanners();
      setSuccessMessage("Баннер удалён");
      setShowSuccess(true);
    } finally {
      setBannerUploading(false);
    }
  };


  const handleDeleteCategory = async (category) => {
    if (!currentUser?.isAdmin) return;

    await api.deleteCategory(category);
    await loadProductsAndCategories();

    setSuccessMessage("Категория удалена");
    setShowSuccess(true);
  };

  const getQtyInCart = (productId) => cart.find((r) => r.productId === productId)?.qty || 0;

  const setQtyForProduct = async (productId, nextQty) => {
    const qty = Math.max(0, Number(nextQty || 0));
    const exists = cart.find((r) => r.productId === productId);
    let newCart;
    if (qty === 0) {
      newCart = cart.filter((r) => r.productId !== productId);
    } else if (exists) {
      newCart = cart.map((r) => (r.productId === productId ? { ...r, qty } : r));
    } else {
      newCart = [...cart, { productId, qty }];
    }
    await saveCart(newCart);
  };

  const incQty = async (productId, delta = 1) => {
    const current = getQtyInCart(productId);
    await setQtyForProduct(productId, current + delta);
  };

  // ✅ В корзину — без большого окна
  const handleAddToCart = async (product) => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    if (addToCartPending[product.id]) return;

    setAddToCartPending((prev) => ({ ...prev, [product.id]: true }));
    try {
      await incQty(product.id, 1);
    } finally {
      setAddToCartPending((prev) => {
        const copy = { ...prev };
        delete copy[product.id];
        return copy;
      });
    }
  };

  const handleSubmitOrder = async () => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    if (submittingOrder) return;

    setSubmittingOrder(true);
    try {
      await api.updateProfile({
        name: orderForm.name || "",
        address: orderForm.address || "",
      });

      const itemsSnapshot = cart
        .map((row) => {
          const product = getProductById(products, row.productId);
          if (!product) return null;
          return { ...product, qty: row.qty };
        })
        .filter(Boolean);

      const total = Number(calcCartTotal(cart, products));

      await api.createOrder({
        status: "new",
        items: itemsSnapshot,
        order_info: {
          name: orderForm.name,
          phone: orderForm.phone,
          address: orderForm.address,
          comment: orderForm.comment || "",
          nickname: currentUser.nickname,
        },
        total,
      });

      await saveCart([]);

      setSuccessMessage("Заказ оформлен! Скоро свяжемся.");
      setShowSuccess(true);

      setOrderForm((prev) => ({ ...prev, comment: "" }));
      setPage("home");

      await loadUserOrders();
      if (currentUser.isAdmin) await loadAdminOrders();
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleAuth = async () => {
    try {
      const phone = (authForm.phone || "").trim();
      const password = authForm.password || "";
      const nickname = (authForm.nickname || "").trim();

      if (!phone || !password) {
        setSuccessMessage("Введите телефон и пароль");
        setShowSuccess(true);
        return;
      }

      if (authMode === "login") {
        const { token } = await api.login({ phone, password });
        setToken(token);

        const prof = await fetchProfile();
        setCurrentUser(prof);

        await loadCartForCurrentUser(prof);

        setOrderForm((prev) => ({
          ...prev,
          name: prof?.name || prev.name || "",
          phone: prof?.phone || phone,
          address: prof?.address || prev.address || "",
          comment: "",
        }));

        setShowAuthModal(false);
        setAuthForm({ phone: "", password: "", nickname: "" });

        setSuccessMessage(`Добро пожаловать, ${prof?.nickname || "пользователь"}!`);
        setShowSuccess(true);

        await loadProductsAndCategories();
        await loadUserOrders();
        if (prof?.isAdmin) await loadAdminOrders();
      } else {
        if (!nickname) {
          setSuccessMessage("Введите никнейм");
          setShowSuccess(true);
          return;
        }

        const { token } = await api.register({ phone, password, nickname });
        setToken(token);

        const prof = await fetchProfile();
        setCurrentUser(prof);

        await window.storage.set(cartKeyFor(prof), JSON.stringify([]));
        setCart([]);

        setOrderForm((prev) => ({
          ...prev,
          name: "",
          phone,
          address: "",
          comment: "",
        }));

        setShowAuthModal(false);
        setAuthForm({ phone: "", password: "", nickname: "" });

        setSuccessMessage("Регистрация успешна!");
        setShowSuccess(true);

        await loadProductsAndCategories();
        await loadUserOrders();
      }
    } catch (e) {
      console.log("auth error", e);
      setSuccessMessage(e?.message || "Ошибка авторизации");
      setShowSuccess(true);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setPage("home");

    const guestKey = cartKeyFor(null);
    const guestCart = await window.storage.get(guestKey);
    if (guestCart) {
      const parsed = JSON.parse(guestCart.value);
      const migrated = await migrateOldCartIfNeeded(guestKey, parsed);
      setCart(migrated);
    } else {
      setCart([]);
    }

    setSuccessMessage("Вы вышли");
    setShowSuccess(true);
  };

  const filteredProductsBase =
    selectedCategory === "all"
      ? products
      : products.filter((p) => {
          const cats =
            Array.isArray(p.categories) && p.categories.length
              ? p.categories
              : [p.category].filter(Boolean);
          return cats.includes(selectedCategory);
        });

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return filteredProductsBase;

    return filteredProductsBase.filter((p) => {
      const hay = `${p.name || ""} ${p.description || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filteredProductsBase, searchTerm]);

  // INIT: вместо supabase.getSession/onAuthStateChange
  useEffect(() => {
    (async () => {
      // грузим каталог сразу
      loadProductsAndCategories().catch(console.error);
      loadBanners().catch(console.error);

      // пробуем поднять профиль по токену
      const prof = await fetchProfile();
      if (prof) {
        setCurrentUser(prof);
        setOrderForm((prev) => ({
          ...prev,
          phone: prof?.phone || "",
          name: prof?.name || prev.name || "",
          address: prof?.address || prev.address || "",
        }));

        try {
          await withTimeout(loadCartForCurrentUser(prof), 8000);
        } catch (e) {
          console.warn("loadCartForCurrentUser timeout:", e);
        }

        try {
          await withTimeout(loadUserOrders(), 8000);
        } catch (e) {
          console.warn("loadUserOrders timeout:", e);
        }

        if (prof?.isAdmin) {
          try {
            await withTimeout(loadAdminOrders(), 8000);
          } catch (e) {
            console.warn("loadAdminOrders timeout:", e);
          }
        }
      } else {
        setCurrentUser(null);
        try {
          await withTimeout(loadCartForCurrentUser(null), 8000);
        } catch (e) {
          console.warn("loadCartForCurrentUser timeout:", e);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      await loadCartForCurrentUser();
      if (currentUser?.phone) {
        setOrderForm((prev) => ({ ...prev, phone: currentUser.phone || "" }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCartKey]);

  useEffect(() => {
    if (!adminMenuOpen) return;
    const handleClickOutside = () => setAdminMenuOpen(false);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [adminMenuOpen]);

  useEffect(() => {
    if (page !== "home") setAdminMenuOpen(false);
  }, [page]);

  // reset pages when lists change
  useEffect(() => {
    setUserOrdersPage(1);
  }, [userOrders.length]);

  useEffect(() => {
    setAdminHistoryPage(1);
  }, [adminOrders.length]);

  const cartCount = cartCountTotal(cart);

  // ✅ статус заказа: pending
  const handleAdminSetStatus = async (orderId, status) => {
    if (!currentUser?.isAdmin) return;
    if (orderStatusPending[orderId]) return;

    setOrderStatusPending((p) => ({ ...p, [orderId]: true }));
    try {
      await api.setOrderStatus(orderId, status);
      await loadAdminOrders();
    } finally {
      setOrderStatusPending((p) => {
        const copy = { ...p };
        delete copy[orderId];
        return copy;
      });
    }
  };

  const openOrderDetails = (order) => {
    setSelectedOrderDetails(order);
    setOrderDetailsOpen(true);
  };

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen relative">
      <Header
        cartCount={cartCount}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onCart={() => setPage("cart")}
      />

      {page === "home" && <div className="px-4 pt-3"><BannerCarousel banners={banners} /></div>}

      {page === "home" && (
        <HomePage
          currentUser={currentUser}
          products={products}
          filteredProducts={filteredProducts}
          productsLoading={productsLoading}
          getQtyInCart={getQtyInCart}
          addToCartPending={addToCartPending}
          onOpenCatalog={() => setPage("catalog")}
          onSelectProduct={setSelectedProduct}
          onAddToCart={handleAddToCart}
          onEdit={handleEditProduct}
          onDelete={handleDeleteProduct}
        />
      )}

      {page === "catalog" && (
        <CatalogPage
          categories={categories}
          products={products}
          currentUser={currentUser}
          onPickCategory={(cat) => {
            setSelectedCategory(cat);
            setPage("home");
          }}
          onDeleteCategory={handleDeleteCategory}
          onBackAll={() => {
            setSelectedCategory("all");
            setPage("home");
          }}
        />
      )}

      {page === "cart" && (
        <CartPage
          cart={cart}
          products={products}
          orderForm={orderForm}
          setOrderForm={setOrderForm}
          currentUser={currentUser}
          submittingOrder={submittingOrder}
          onSubmitOrder={handleSubmitOrder}
          onInc={incQty}
          onSetQty={setQtyForProduct}
        />
      )}

      {page === "profile" && (
        <ProfilePage
          currentUser={currentUser}
          userOrders={userOrders}
          adminOrders={adminOrders}
          orderStatusPending={orderStatusPending}
          userOrdersRefreshing={userOrdersRefreshing}
          adminOrdersRefreshing={adminOrdersRefreshing}
          userOrdersPage={userOrdersPage}
          setUserOrdersPage={setUserOrdersPage}
          adminHistoryPage={adminHistoryPage}
          setAdminHistoryPage={setAdminHistoryPage}
          onRefreshUserOrders={refreshUserOrders}
          onRefreshAdminOrders={refreshAdminOrders}
          onAdminSetStatus={handleAdminSetStatus}
          onLogout={handleLogout}
          onOpenAuth={() => setShowAuthModal(true)}
          onOpenOrderDetails={openOrderDetails}
        />
      )}

      {/* Admin floating actions (only on home) */}
      {currentUser?.isAdmin && page === "home" && (
        <div className="admin-fab" onClick={(e) => e.stopPropagation()}>
          {adminMenuOpen && (
            <div className="admin-fab-menu w-52 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => {
                  setAdminMenuOpen(false);
                  setEditingProduct(null);
                  setProductForm({
                    name: "",
                    price: "",
                    oldPrice: "",
                    discount: "",
                    description: "",
                    category: "",
                    categories: [],
                    images: [],
                  });
                  setShowProductModal(true);
                }}
                className="w-full px-4 py-3 text-left font-semibold text-gray-900 hover:bg-gray-50 flex items-center gap-2"
                type="button"
              >
                <Plus size={18} className="text-blue-600" /> Добавить товар
              </button>

              <button
                onClick={() => {
                  setAdminMenuOpen(false);
                  setShowCategoryModal(true);
                }}
                className="w-full px-4 py-3 text-left font-semibold text-gray-900 hover:bg-gray-50 flex items-center gap-2"
                type="button"
              >
                <Grid3x3 size={18} className="text-green-600" /> Категории
              </button>

              <button
                onClick={() => {
                  setAdminMenuOpen(false);
                  setShowBannersModal(true);
                }}
                className="w-full px-4 py-3 text-left font-semibold text-gray-900 hover:bg-gray-50 flex items-center gap-2"
                type="button"
              >
                <Grid3x3 size={18} className="text-lime-600" /> Баннеры
              </button>
            </div>
          )}

          <button
            onClick={() => setAdminMenuOpen((v) => !v)}
            className="h-14 w-14 rounded-2xl shadow-2xl bg-gradient-to-r from-lime-500 to-green-500 text-white flex items-center justify-center hover:scale-110 transition-transform"
            type="button"
            aria-label="admin-actions"
          >
            <Plus size={26} />
          </button>
        </div>
      )}

      <BottomNav page={page} setPage={setPage} />

      {showSuccess && (
        <SuccessNotification message={successMessage} onClose={() => setShowSuccess(false)} />
      )}

      {/* Order details modal (admin) */}
      {orderDetailsOpen && (
        <OrderDetailsModal
          order={selectedOrderDetails}
          onClose={() => {
            setOrderDetailsOpen(false);
            setSelectedOrderDetails(null);
          }}
        />
      )}

      {/* Product details modal */}
      {selectedProduct && (
        <div className="product-modal-overlay modal-overlay">
          <div className="product-modal modal-content">
            <div className="product-modal-header">
              <div className="product-modal-titlewrap">
                <h3 className="product-modal-title">{selectedProduct.name}</h3>
              </div>

              <button
                onClick={() => setSelectedProduct(null)}
                className="product-modal-close hover-scale"
                type="button"
                aria-label="close"
              >
                <X size={22} />
              </button>
            </div>

            <div className="product-modal-body">
              <div className="product-modal-gallery">
                <SwipeGallery images={selectedProduct.images || []} />
              </div>

              <div className="product-modal-price">
                <div className="product-modal-price-main">{selectedProduct.price} BYN</div>
                {selectedProduct.oldPrice && (
                  <div className="product-modal-price-old">{selectedProduct.oldPrice} BYN</div>
                )}
              </div>

              {selectedProduct.description && (
                <div className="product-modal-desc">{selectedProduct.description}</div>
              )}
            </div>

            <div className="product-modal-actions">
              {currentUser ? (
                <button
                  onClick={() => {
                    handleAddToCart(selectedProduct);
                    setSelectedProduct(null);
                  }}
                  className="product-modal-action-btn ripple"
                  type="button"
                  disabled={!!addToCartPending[selectedProduct.id]}
                >
                  {addToCartPending[selectedProduct.id] ? "Добавляем..." : "Добавить в корзину"}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSelectedProduct(null);
                    setShowAuthModal(true);
                  }}
                  className="product-modal-action-btn ripple"
                  type="button"
                >
                  Войдите, чтобы добавить в корзину
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auth modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 modal-overlay">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm border border-gray-200 modal-content">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-extrabold text-gray-900">
                {authMode === "login" ? "Вход" : "Регистрация"}
              </h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="p-2 hover:rotate-90 transition-transform"
                type="button"
              >
                <X size={22} />
              </button>
            </div>

            {authMode === "register" && (
              <input
                type="text"
                placeholder="Никнейм"
                value={authForm.nickname}
                onChange={(e) => setAuthForm({ ...authForm, nickname: e.target.value })}
                className="w-full p-3 border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-lime-300"
              />
            )}

            <input
              type="tel"
              placeholder="Номер телефона"
              value={authForm.phone}
              onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
              className="w-full p-3 border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-lime-300"
            />

            <input
              type="password"
              placeholder="Пароль"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              className="w-full p-3 border rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-lime-300"
            />

            <button
              onClick={handleAuth}
              disabled={authMode === "register" && !authForm.nickname}
              className="w-full bg-gradient-to-r from-lime-500 to-green-500 text-white py-3 rounded-xl font-extrabold mb-3 disabled:opacity-50 hover:scale-105 transition-transform"
              type="button"
            >
              {authMode === "login" ? "Войти" : "Зарегистрироваться"}
            </button>

            <button
              onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
              className="w-full text-lime-700 text-sm font-semibold hover:scale-105 transition-transform"
              type="button"
            >
              {authMode === "login" ? "Нет аккаунта? Зарегистрируйтесь" : "Уже есть аккаунт? Войдите"}
            </button>
          </div>
        </div>
      )}

      {/* Product modal (admin) */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-overlay">
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl sm:rounded-3xl p-4 max-h-[90vh] overflow-y-auto hide-scrollbar modal-content">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-extrabold text-gray-900">
                {editingProduct ? "Редактировать товар" : "Добавить товар"}
              </h3>
              <button
                onClick={() => setShowProductModal(false)}
                className="p-2 hover:rotate-90 transition-transform"
                type="button"
                disabled={savingProduct}
              >
                <X size={22} />
              </button>
            </div>

            <input
              type="text"
              placeholder="Название товара"
              value={productForm.name}
              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              className="w-full p-3 border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-lime-300"
            />

            <input
              type="text"
              placeholder="Цена (например: 89,99)"
              value={productForm.price}
              onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
              className="w-full p-3 border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-lime-300"
            />

            <input
              type="text"
              placeholder="Старая цена (опционально)"
              value={productForm.oldPrice}
              onChange={(e) => setProductForm({ ...productForm, oldPrice: e.target.value })}
              className="w-full p-3 border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-lime-300"
            />

            <input
              type="text"
              placeholder="Скидка (например: -40%)"
              value={productForm.discount}
              onChange={(e) => setProductForm({ ...productForm, discount: e.target.value })}
              className="w-full p-3 border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-lime-300"
            />

            <textarea
              placeholder="Описание"
              value={productForm.description}
              onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
              className="w-full p-3 border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-lime-300"
              rows="3"
            />

            
            <CategoryMultiSelect
              options={categories}
              value={Array.isArray(productForm.categories) ? productForm.categories : []}
              onChange={(vals) =>
                setProductForm((p) => ({
                  ...p,
                  categories: vals,
                  category: vals[0] || "",
                }))
              }
            />
            <div className="text-xs text-gray-500 -mt-2 mb-3">
              Зажми Ctrl/⌘ чтобы выбрать несколько
            </div>

            <div className="mb-3">
              <div className="text-sm font-bold text-gray-900 mb-2">Фото</div>
              <div className="file-upload">
                <input
                  id="product-images"
                  className="file-upload-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImagesUpload}
                  disabled={savingProduct}
                />
                <label htmlFor="product-images" className="file-upload-btn">
                  Выбрать файлы
                </label>
                <span className="file-upload-hint">
                  {productForm.images?.length
                    ? `Выбрано: ${productForm.images.length}`
                    : "Файлы не выбраны"}
                </span>
              </div>
              {productForm.images?.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {productForm.images.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} alt="img" className="w-full h-20 object-cover rounded-xl" />
                      <button
                        onClick={() => removeProductImage(i)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                        type="button"
                        aria-label="remove-img"
                        disabled={savingProduct}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleSaveProduct}
              disabled={savingProduct}
              className="w-full bg-gradient-to-r from-lime-500 to-green-500 text-white py-3 rounded-xl font-extrabold disabled:opacity-50 hover:scale-105 transition-transform"
              type="button"
            >
              {savingProduct ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </div>
      )}

      {/* Category modal (admin) */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-overlay">
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl sm:rounded-3xl p-4 max-h-[90vh] overflow-y-auto hide-scrollbar modal-content">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-extrabold text-gray-900">Категории</h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="p-2 hover:rotate-90 transition-transform"
                type="button"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Новая категория"
                className="flex-1 p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-300"
              />
              <button
                onClick={handleAddCategory}
                className="px-4 rounded-xl bg-lime-500 text-white font-extrabold hover:scale-105 transition-transform"
                type="button"
              >
                +
              </button>
            </div>

            <div className="space-y-2">
              {categories.map((c) => (
                <div
                  key={c}
                  className="flex items-center justify-between border border-gray-200 rounded-2xl p-3"
                >
                  <div className="font-bold text-gray-900">{c}</div>
                  <button
                    onClick={() => handleDeleteCategory(c)}
                    className="text-sm font-bold text-red-600 bg-red-50 px-3 py-2 rounded-xl hover:scale-105 transition-transform"
                    type="button"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    
      {/* Banners modal (admin) */}
      {showBannersModal && (
        <AdminBannersModal
          banners={banners}
          adding={bannerUploading}
          onClose={() => setShowBannersModal(false)}
          onAdd={handleAddBanner}
          onDelete={handleDeleteBanner}
        />
      )}

</div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TelegramShop />
  </React.StrictMode>
);
