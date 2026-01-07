// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * CORS (для локальной разработки)
 */
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ⚠️ Баннеры/картинки приходят base64 -> увеличиваем лимит
app.use(express.json({ limit: "25mb" }));

// логирование (можно отключить)
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    console.log(`📥 ${req.method} ${req.path}`);
  }
  next();
});

const env = (key, ...alts) => {
  const keys = [key, ...alts].filter(Boolean);
  for (const k of keys) {
    const v = process.env[k];
    if (v != null && String(v).trim() !== "") return v;
  }
  return undefined;
};

const DB_HOST = env("DB_HOST", "MYSQL_HOST") || "localhost";
const DB_USER = env("DB_USER", "MYSQL_USER") || "";
const DB_PASSWORD = env("DB_PASSWORD", "MYSQL_PASSWORD") || "";
const DB_NAME = env("DB_NAME", "MYSQL_DATABASE", "MYSQL_DB") || "";

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
  connectTimeout: 30000,
});

pool
  .getConnection()
  .then(async (conn) => {
    console.log("✅ DB connected:", conn.config.host, "db:", conn.config.database);
    conn.release();

    // --- БАННЕРЫ: таблица ---
    // image хранится как base64 (data:image/...;base64,...)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS banners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        image LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4
    `);
    console.log("✅ banners table ok");
  })
  .catch((err) => {
    console.error("❌ DB connection failed:", err.message);
  });

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

function normalizePhone(input) {
  return String(input || "").trim().replace(/\D+/g, "");
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, phone: user.phone, isAdmin: !!user.is_admin },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "NO_TOKEN" });

  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "BAD_TOKEN" });
  }
}

function adminRequired(req, res, next) {
  if (!req.auth?.isAdmin) return res.status(403).json({ error: "forbidden" });
  next();
}

function safeJsonParse(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

async function isFirstUser() {
  const [rows] = await pool.execute("SELECT COUNT(*) AS c FROM users");
  return Number(rows?.[0]?.c || 0) === 0;
}

/* =========================
   AUTH
========================= */

app.post("/api/auth/register", async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");
    const nickname = String(req.body.nickname || "").trim();

    if (!phone || !password || !nickname) {
      return res.status(400).json({ error: "phone/password/nickname required" });
    }

    const [exists] = await pool.execute(
      "SELECT id FROM users WHERE phone=? LIMIT 1",
      [phone]
    );
    if (exists.length) {
      return res.status(409).json({ error: "PHONE_EXISTS" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    let makeAdmin = false;
    const adminPhone = normalizePhone(process.env.ADMIN_PHONE || "");
    if (adminPhone && phone === adminPhone) makeAdmin = true;
    if (!makeAdmin && (await isFirstUser())) makeAdmin = true;

    const [r] = await pool.execute(
      "INSERT INTO users (phone, password_hash, nickname, name, address, is_admin, created_at) VALUES (?, ?, ?, '', '', ?, NOW())",
      [phone, password_hash, nickname, makeAdmin ? 1 : 0]
    );

    const id = r.insertId;

    const [rows] = await pool.execute(
      "SELECT id, phone, nickname, name, address, is_admin FROM users WHERE id=? LIMIT 1",
      [id]
    );
    const u = rows[0];

    const token = signToken(u);

    return res.json({
      token,
      user: {
        id: u.id,
        phone: u.phone,
        nickname: u.nickname,
        name: u.name || "",
        address: u.address || "",
        isAdmin: !!u.is_admin,
      },
    });
  } catch (e) {
    console.error("❌ Register error:", e);
    if (e && (e.code === "ER_DUP_ENTRY" || e.errno === 1062)) {
      return res.status(409).json({ error: "PHONE_EXISTS" });
    }
    return res.status(500).json({ error: "server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (!phone || !password) {
      return res.status(400).json({ error: "phone/password required" });
    }

    const [rows] = await pool.execute(
      "SELECT id, phone, password_hash, nickname, name, address, is_admin FROM users WHERE phone=? LIMIT 1",
      [phone]
    );
    const u = rows[0];
    if (!u) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const token = signToken(u);

    return res.json({
      token,
      user: {
        id: u.id,
        phone: u.phone,
        nickname: u.nickname,
        name: u.name || "",
        address: u.address || "",
        isAdmin: !!u.is_admin,
      },
    });
  } catch (e) {
    console.error("❌ Login error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.get("/api/me", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, phone, nickname, name, address, is_admin FROM users WHERE id=? LIMIT 1",
      [req.auth.id]
    );
    const u = rows[0];
    if (!u) return res.status(401).json({ error: "unauthorized" });

    return res.json({
      user: {
        id: u.id,
        phone: u.phone,
        nickname: u.nickname,
        name: u.name || "",
        address: u.address || "",
        isAdmin: !!u.is_admin,
      },
    });
  } catch (e) {
    console.error("❌ /api/me error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.put("/api/me", authRequired, async (req, res) => {
  try {
    const name = String(req.body.name || "");
    const address = String(req.body.address || "");
    await pool.execute("UPDATE users SET name=?, address=? WHERE id=?", [
      name,
      address,
      req.auth.id,
    ]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ Update profile error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

/* =========================
   CATEGORIES
========================= */

app.get("/api/categories", async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT name FROM categories ORDER BY id");
    return res.json({ categories: rows.map((r) => r.name) });
  } catch (e) {
    console.error("❌ Get categories error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.post("/api/admin/categories", authRequired, adminRequired, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "name required" });

    await pool.execute("INSERT INTO categories (name) VALUES (?)", [name]);
    return res.json({ ok: true });
  } catch (e) {
    if (e && (e.code === "ER_DUP_ENTRY" || e.errno === 1062)) {
      return res.status(409).json({ error: "exists" });
    }
    console.error("❌ Add category error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.delete("/api/admin/categories/:name", authRequired, adminRequired, async (req, res) => {
  try {
    const name = String(req.params.name || "");
    await pool.execute("DELETE FROM categories WHERE name=?", [name]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ Delete category error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

/* =========================
   PRODUCTS
========================= */

app.get("/api/products", async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, price, old_price, discount, description, category, categories, images FROM products ORDER BY id"
    );

    const products = rows.map((p) => ({
      id: p.id,
      name: p.name,
      price: String(p.price ?? ""),
      oldPrice: p.old_price == null ? "" : String(p.old_price),
      discount: p.discount || "",
      description: p.description || "",
      category: p.category || "",
      categories: safeJsonParse(p.categories, []),
      images: safeJsonParse(p.images, []),
    }));

    return res.json({ products });
  } catch (e) {
    console.error("❌ Get products error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.post("/api/admin/products", authRequired, adminRequired, async (req, res) => {
  try {
    const p = req.body || {};
    const name = String(p.name || "").trim();
    if (!name) return res.status(400).json({ error: "name required" });

    const price = Number(p.price || 0);
    const old_price = p.old_price == null ? null : Number(p.old_price);
    const discount = p.discount || null;
    const description = p.description || null;
    const category = p.category || null;
    const categories = JSON.stringify(Array.isArray(p.categories) ? p.categories : []);
    const images = JSON.stringify(Array.isArray(p.images) ? p.images : []);

    const [r] = await pool.execute(
      "INSERT INTO products (name, price, old_price, discount, description, category, categories, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [name, price, old_price, discount, description, category, categories, images]
    );

    return res.json({ ok: true, id: r.insertId });
  } catch (e) {
    console.error("❌ Add product error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.put("/api/admin/products/:id", authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const p = req.body || {};
    const name = String(p.name || "").trim();
    if (!name) return res.status(400).json({ error: "name required" });

    const price = Number(p.price || 0);
    const old_price = p.old_price == null ? null : Number(p.old_price);
    const discount = p.discount || null;
    const description = p.description || null;
    const category = p.category || null;
    const categories = JSON.stringify(Array.isArray(p.categories) ? p.categories : []);
    const images = JSON.stringify(Array.isArray(p.images) ? p.images : []);

    await pool.execute(
      "UPDATE products SET name=?, price=?, old_price=?, discount=?, description=?, category=?, categories=?, images=? WHERE id=?",
      [name, price, old_price, discount, description, category, categories, images, id]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ Update product error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.delete("/api/admin/products/:id", authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.execute("DELETE FROM products WHERE id=?", [id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ Delete product error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

/* =========================
   ORDERS
========================= */

app.get("/api/orders", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, user_id, status, items, order_info, total, created_at FROM orders WHERE user_id=? ORDER BY created_at DESC",
      [req.auth.id]
    );

    const orders = rows.map((o) => ({
      ...o,
      items: safeJsonParse(o.items, []),
      order_info: safeJsonParse(o.order_info, {}),
    }));

    return res.json({ orders });
  } catch (e) {
    console.error("❌ Get orders error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.post("/api/orders", authRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const items = JSON.stringify(Array.isArray(body.items) ? body.items : []);
    const order_info = JSON.stringify(body.order_info || {});
    const total = Number(body.total || 0);

    await pool.execute(
      "INSERT INTO orders (user_id, status, items, order_info, total) VALUES (?, 'new', ?, ?, ?)",
      [req.auth.id, items, order_info, total]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ Create order error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.get("/api/admin/orders", authRequired, adminRequired, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, user_id, status, items, order_info, total, created_at FROM orders ORDER BY created_at DESC"
    );

    const orders = rows.map((o) => ({
      ...o,
      items: safeJsonParse(o.items, []),
      order_info: safeJsonParse(o.order_info, {}),
    }));

    return res.json({ orders });
  } catch (e) {
    console.error("❌ Get admin orders error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

app.patch("/api/admin/orders/:id", authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || "").trim();
    if (!status) return res.status(400).json({ error: "status required" });

    await pool.execute("UPDATE orders SET status=? WHERE id=?", [status, id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ Update order error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

/* =========================
   BANNERS
========================= */

// public
app.get("/api/banners", async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT id, image FROM banners ORDER BY id DESC");
    return res.json({ banners: rows });
  } catch (e) {
    console.error("❌ Get banners error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

// admin add
app.post("/api/admin/banners", authRequired, adminRequired, async (req, res) => {
  try {
    const image = String(req.body.image || "");
    if (!image) return res.status(400).json({ error: "image required" });

    await pool.execute("INSERT INTO banners (image) VALUES (?)", [image]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ Add banner error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

// admin delete
app.delete("/api/admin/banners/:id", authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.execute("DELETE FROM banners WHERE id=?", [id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ Delete banner error:", e);
    return res.status(500).json({ error: "server error" });
  }
});

/* =========================
   FRONTEND
========================= */

app.use(express.static(path.join(__dirname, "dist")));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => console.log("🚀 Server started on port", PORT));
