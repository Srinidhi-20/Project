// =============================================================
//   QUICKBITE FOOD DELIVERY SYSTEM — Backend API Server
//   Stack : Node.js + Express + oracledb + bcryptjs + JWT
//   File  : backend/server.js
//   Start : node server.js
// =============================================================

const express = require('express');
const path = require('path');
const oracledb = require('oracledb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'quickbite_secret_2024';

// ─── Oracle DB connection config ─────────────────────────────
// Update these with your Oracle credentials
const DB_CONFIG = {
    user: process.env.DB_USER || 'quickbite',
    password: process.env.DB_PASSWORD || 'quickbite123',
    connectString: process.env.DB_HOST || 'localhost:1521/XEPDB1',
    // For Oracle XE:   'localhost:1521/XE'
    // For Oracle 19c:  'localhost:1521/ORCLPDB1'
};

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: '*' }));          // restrict to your domain in production
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));       // serves frontend/index.html
// 👉 ADD HERE
app.get("/api", (req, res) => {
    res.send("🚀 QuickBite API is running successfully!");
});
// ─── DB Pool (connection pooling for performance) ─────────────
let pool;
async function initPool() {
    pool = await oracledb.createPool({
        ...DB_CONFIG,
        poolMin: 2,
        poolMax: 10,
        poolIncrement: 1,
    });
    console.log('✅ Oracle DB pool created');
}

// helper: get a connection, run callback, release
async function withDB(callback) {
    let conn;
    try {
        conn = await pool.getConnection();
        return await callback(conn);
    } finally {
        if (conn) await conn.close();
    }
}

// ─── JWT Auth Middleware ──────────────────────────────────────
function auth(role) {
    return (req, res, next) => {
        const header = req.headers['authorization'];
        if (!header) return res.status(401).json({ error: 'No token provided' });
        const token = header.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (role && decoded.role !== role && decoded.role !== 'admin') {
                return res.status(403).json({ error: 'Access denied' });
            }
            req.user = decoded;
            next();
        } catch {
            res.status(401).json({ error: 'Invalid or expired token' });
        }
    };
}

// =============================================================
//   AUTH ROUTES
// =============================================================

// POST /api/auth/register
// Body: { name, email, phone, password, role, address?, vehicle_type?, vehicle_number? }
app.post('/api/auth/register', async (req, res) => {
    const { name, email, phone, password, role, address, vehicle_type, vehicle_number } = req.body;

    if (!name || !email || !phone || !password || !role)
        return res.status(400).json({ error: 'All required fields must be provided' });

    if (!/^(?![0-9]+$)[a-zA-Z0-9 ]+$/.test(name))
        return res.status(400).json({ error: 'Name must contain letters and cannot be only numbers' });

    if (!/^[a-zA-Z0-9._-]+@gmail\.com$/.test(email))
        return res.status(400).json({ error: 'Email must be a valid @gmail.com address' });

    if (!/^\d{10}$/.test(phone))
        return res.status(400).json({ error: 'Phone number must be exactly 10 digits' });

    if (!['customer', 'delivery'].includes(role))
        return res.status(400).json({ error: 'Role must be customer or delivery' });

    if (password.length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters' });

    if (role === 'customer') {
        if (!address) return res.status(400).json({ error: 'Address is required for customers' });
        const parts = address.split(',').map(p => p.trim());
        if (parts.length !== 4) return res.status(400).json({ error: 'Address must be in format: House Number, Street Name, City, Zip Code' });
        if (!/^[a-zA-Z0-9/ ]+$/.test(parts[0])) return res.status(400).json({ error: 'Invalid house number format' });
        if (!/^[a-zA-Z ]+$/.test(parts[1])) return res.status(400).json({ error: 'Street name must contain only letters' });
        if (!/^[a-zA-Z ]+$/.test(parts[2])) return res.status(400).json({ error: 'City must contain only letters' });
        if (!/^\d{6}$/.test(parts[3])) return res.status(400).json({ error: 'Zip code must be exactly 6 digits' });
    }

    if (role === 'delivery') {
        if (!vehicle_number) return res.status(400).json({ error: 'Vehicle number is required for delivery role' });
        if (!/^[a-zA-Z]{2} \d{2} [a-zA-Z]{1,2} (?!0000)\d{4}$/.test(vehicle_number))
            return res.status(400).json({ error: 'Invalid vehicle number format' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);

        await withDB(async (conn) => {
            // Check duplicate email
            const dupEmail = await conn.execute(
                'SELECT id FROM users WHERE email = :email',
                { email }
            );
            if (dupEmail.rows.length > 0)
                throw { status: 409, error: 'Email already registered' };

            // Check duplicate name
            const dupName = await conn.execute(
                'SELECT id FROM users WHERE name = :name',
                { name }
            );
            if (dupName.rows.length > 0)
                throw { status: 409, error: 'Name already registered' };

            await conn.execute(
                `INSERT INTO users (name, email, phone, password_hash, role, address, vehicle_type, vehicle_number)
                 VALUES (:name, :email, :phone, :hash, :role, :address, :vtype, :vnum)`,
                {
                    name, email, phone, hash, role,
                    address: address || null,
                    vtype: vehicle_type || null,
                    vnum: vehicle_number || null
                },
                { autoCommit: true }
            );

            const result = await conn.execute(
                'SELECT id, name, email, phone, role, address FROM users WHERE email = :email',
                { email }
            );
            const user = mapRow(result);
            const token = jwt.sign({ id: user.ID, email: user.EMAIL, role: user.ROLE }, JWT_SECRET, { expiresIn: '7d' });
            return res.status(201).json({ message: 'Registered successfully', token, user });
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.error });
        console.error('Register error:', err);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// POST /api/auth/login
// Body: { email, password, role }
app.post('/api/auth/login', async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role)
        return res.status(400).json({ error: 'Email, password and role required' });

    try {
        // Admin shortcut
        if (role === 'admin') {
            if (email !== 'admin@quickbite.com')
                return res.status(401).json({ error: 'Invalid admin credentials' });
        }

        await withDB(async (conn) => {
            const result = await conn.execute(
                `SELECT id, name, email, phone, role, address, vehicle_type, vehicle_number,
                        password_hash, deliveries_done, created_at
                 FROM users WHERE email = :email AND role = :role AND is_active = 1`,
                { email, role }
            );
            if (result.rows.length === 0)
                throw { status: 401, error: 'Invalid email or password' };

            const row = mapRow(result);
            const match = await bcrypt.compare(password, row.PASSWORD_HASH);
            if (!match) throw { status: 401, error: 'Invalid email or password' };

            const token = jwt.sign(
                { id: row.ID, email: row.EMAIL, role: row.ROLE },
                JWT_SECRET,
                { expiresIn: '7d' }
            );
            delete row.PASSWORD_HASH;
            return res.json({ message: 'Login successful', token, user: row });
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.error });
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// =============================================================
//   MENU ROUTES  (public — no auth required)
// =============================================================

// GET /api/menu
app.get('/api/menu', async (req, res) => {
    try {
        await withDB(async (conn) => {
            const result = await conn.execute(
                `SELECT m.id, m.name, m.description, m.category, m.price,
                        m.emoji, m.is_veg, m.is_available, r.name AS restaurant_name
                 FROM menu_items m
                 JOIN restaurants r ON m.restaurant_id = r.id
                 WHERE m.is_available = 1
                 ORDER BY m.category, m.price`,
                {}
            );
            return res.json(mapRows(result));
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch menu' });
    }
});

// GET /api/menu/categories
app.get('/api/menu/categories', async (req, res) => {
    try {
        await withDB(async (conn) => {
            const result = await conn.execute(
                'SELECT DISTINCT category FROM menu_items WHERE is_available=1 ORDER BY category',
                {}
            );
            return res.json(result.rows.map(r => r[0]));
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// GET /api/restaurant
app.get('/api/restaurant', async (req, res) => {
    try {
        await withDB(async (conn) => {
            const result = await conn.execute('SELECT * FROM restaurants WHERE id = 1', {});
            return res.json(mapRow(result));
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch restaurant info' });
    }
});

// =============================================================
//   ORDER ROUTES — Customer
// =============================================================

// POST /api/orders  — Place a new order
// Body: { delivery_address, items:[{menu_item_id, quantity}], payment_method }
app.post('/api/orders', auth('customer'), async (req, res) => {
    const { delivery_address, items, payment_method } = req.body;
    if (!delivery_address || !items || items.length === 0 || !payment_method)
        return res.status(400).json({ error: 'delivery_address, items and payment_method required' });

    if (!['UPI', 'Card', 'NetBanking', 'COD'].includes(payment_method))
        return res.status(400).json({ error: 'Invalid payment method' });

    try {
        await withDB(async (conn) => {
            // Fetch prices for all items (prevent client-side price tampering)
            const itemIds = items.map(i => i.menu_item_id);
            const placeholders = itemIds.map((_, i) => `:id${i}`).join(',');
            const menuResult = await conn.execute(
                `SELECT id, name, price FROM menu_items WHERE id IN (${placeholders}) AND is_available=1`,
                Object.fromEntries(itemIds.map((id, i) => [`id${i}`, id]))
            );
            const menuMap = {};
            menuResult.rows.forEach(r => { menuMap[r[0]] = { name: r[1], price: r[2] }; });

            let subtotal = 0;
            items.forEach(i => {
                if (!menuMap[i.menu_item_id]) throw { status: 400, error: `Item ${i.menu_item_id} not available` };
                subtotal += menuMap[i.menu_item_id].price * i.quantity;
            });

            const gst = Math.round(subtotal * 0.05 * 100) / 100;
            const delivery_fee = subtotal >= 300 ? 0 : 40;
            const total = subtotal + gst + delivery_fee;
            const pay_status = payment_method === 'COD' ? 'Pending' : 'Paid';

            // Use stored procedure to insert order
            const out = { order_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } };
            const proc = await conn.execute(
                `BEGIN place_order(:cid,:rid,:addr,:sub,:gst,:dfee,:total,:pmethod,:pstatus,:oid); END;`,
                {
                    cid: req.user.id, rid: 1,
                    addr: delivery_address,
                    sub: subtotal, gst, dfee: delivery_fee, total,
                    pmethod: payment_method, pstatus: pay_status,
                    oid: out.order_id
                }
            );
            const orderId = proc.outBinds.oid;

            // Insert order items
            for (const item of items) {
                const m = menuMap[item.menu_item_id];
                await conn.execute(
                    `INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity)
                     VALUES (:oid, :mid, :name, :price, :qty)`,
                    { oid: orderId, mid: item.menu_item_id, name: m.name, price: m.price, qty: item.quantity },
                    { autoCommit: false }
                );
            }
            await conn.commit();

            return res.status(201).json({
                message: 'Order placed successfully',
                order_id: orderId, subtotal, gst, delivery_fee, total, payment_status: pay_status
            });
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.error });
        console.error('Place order error:', err);
        res.status(500).json({ error: 'Failed to place order' });
    }
});

// GET /api/orders/my  — Customer: get their own orders
app.get('/api/orders/my', auth('customer'), async (req, res) => {
    try {
        await withDB(async (conn) => {
            const result = await conn.execute(
                `SELECT o.id, o.order_status, o.payment_method, o.payment_status,
                        o.subtotal, o.gst_amount, o.delivery_fee, o.total_amount,
                        o.delivery_address, o.placed_at, o.accepted_at, o.picked_at, o.delivered_at,
                        d.name AS delivery_boy_name, d.phone AS delivery_boy_phone
                 FROM orders o
                 LEFT JOIN users d ON o.delivery_boy_id = d.id
                 WHERE o.customer_id = :cid
                 ORDER BY o.placed_at DESC`,
                { cid: req.user.id }
            );
            const orders = mapRows(result);

            // Attach items to each order
            for (const order of orders) {
                const items = await conn.execute(
                    `SELECT oi.item_name, oi.item_price, oi.quantity, oi.line_total, mi.emoji
                     FROM order_items oi
                     JOIN menu_items mi ON oi.menu_item_id = mi.id
                     WHERE oi.order_id = :oid`,
                    { oid: order.ID }
                );
                order.ITEMS = mapRows(items);
            }

            return res.json(orders);
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// GET /api/orders/:id  — Get single order detail
app.get('/api/orders/:id', auth(), async (req, res) => {
    const orderId = parseInt(req.params.id);
    try {
        await withDB(async (conn) => {
            const result = await conn.execute(
                `SELECT * FROM v_order_summary WHERE order_id = :oid`,
                { oid: orderId }
            );
            if (result.rows.length === 0)
                throw { status: 404, error: 'Order not found' };

            const order = mapRow(result);
            const items = await conn.execute(
                `SELECT oi.item_name, oi.item_price, oi.quantity, oi.line_total, mi.emoji
                 FROM order_items oi
                 JOIN menu_items mi ON oi.menu_item_id = mi.id
                 WHERE oi.order_id = :oid`,
                { oid: orderId }
            );
            order.ITEMS = mapRows(items);
            return res.json(order);
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.error });
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// =============================================================
//   ORDER ROUTES — Delivery Boy
// =============================================================

// GET /api/delivery/pending  — All unassigned pending orders
app.get('/api/delivery/pending', auth('delivery'), async (req, res) => {
    try {
        await withDB(async (conn) => {
            const result = await conn.execute('SELECT * FROM v_pending_orders', {});
            const orders = mapRows(result);
            for (const order of orders) {
                const items = await conn.execute(
                    `SELECT oi.item_name, oi.quantity, mi.emoji FROM order_items oi
                     JOIN menu_items mi ON oi.menu_item_id = mi.id
                     WHERE oi.order_id = :oid`,
                    { oid: order.ORDER_ID }
                );
                order.ITEMS = mapRows(items);
            }
            return res.json(orders);
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch pending orders' });
    }
});

// GET /api/delivery/my-active  — Delivery boy's active orders
app.get('/api/delivery/my-active', auth('delivery'), async (req, res) => {
    try {
        await withDB(async (conn) => {
            const result = await conn.execute(
                `SELECT o.id AS order_id, o.order_status, o.delivery_address,
                        o.total_amount, o.payment_method, o.placed_at, o.accepted_at,
                        c.name AS customer_name, c.phone AS customer_phone
                 FROM orders o
                 JOIN users c ON o.customer_id = c.id
                 WHERE o.delivery_boy_id = :did
                   AND o.order_status IN ('Accepted','Picked Up')
                 ORDER BY o.accepted_at DESC`,
                { did: req.user.id }
            );
            const orders = mapRows(result);
            for (const order of orders) {
                const items = await conn.execute(
                    `SELECT oi.item_name, oi.quantity, mi.emoji FROM order_items oi
                     JOIN menu_items mi ON oi.menu_item_id = mi.id
                     WHERE oi.order_id = :oid`,
                    { oid: order.ORDER_ID }
                );
                order.ITEMS = mapRows(items);
            }
            return res.json(orders);
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch active orders' });
    }
});

// GET /api/delivery/history  — Delivery boy's completed orders
app.get('/api/delivery/history', auth('delivery'), async (req, res) => {
    try {
        await withDB(async (conn) => {
            const result = await conn.execute(
                `SELECT o.id AS order_id, o.order_status, o.delivery_address,
                        o.total_amount, o.payment_method, o.placed_at, o.delivered_at,
                        c.name AS customer_name
                 FROM orders o
                 JOIN users c ON o.customer_id = c.id
                 WHERE o.delivery_boy_id = :did AND o.order_status = 'Delivered'
                 ORDER BY o.delivered_at DESC`,
                { did: req.user.id }
            );
            return res.json(mapRows(result));
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// PATCH /api/delivery/orders/:id/accept  — Accept an order
app.patch('/api/delivery/orders/:id/accept', auth('delivery'), async (req, res) => {
    const orderId = parseInt(req.params.id);
    try {
        await withDB(async (conn) => {
            // Make sure order is still Pending
            const check = await conn.execute(
                'SELECT id, order_status FROM orders WHERE id = :oid FOR UPDATE',
                { oid: orderId }
            );
            if (check.rows.length === 0) throw { status: 404, error: 'Order not found' };
            if (check.rows[0][1] !== 'Pending') throw { status: 409, error: 'Order already taken' };

            await conn.execute(
                `BEGIN update_order_status(:oid, 'Accepted', :did); END;`,
                { oid: orderId, did: req.user.id }
            );
            return res.json({ message: 'Order accepted', order_id: orderId });
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.error });
        res.status(500).json({ error: 'Failed to accept order' });
    }
});

// PATCH /api/delivery/orders/:id/status  — Update status (Picked Up / Delivered)
// Body: { status: 'Picked Up' | 'Delivered' }
app.patch('/api/delivery/orders/:id/status', auth('delivery'), async (req, res) => {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;
    if (!['Picked Up', 'Delivered'].includes(status))
        return res.status(400).json({ error: 'Status must be "Picked Up" or "Delivered"' });

    try {
        await withDB(async (conn) => {
            const check = await conn.execute(
                'SELECT delivery_boy_id, order_status FROM orders WHERE id = :oid',
                { oid: orderId }
            );
            if (check.rows.length === 0) throw { status: 404, error: 'Order not found' };
            if (check.rows[0][0] !== req.user.id) throw { status: 403, error: 'Not your order' };

            await conn.execute(
                `BEGIN update_order_status(:oid, :status, NULL); END;`,
                { oid: orderId, status }
            );
            return res.json({ message: `Status updated to "${status}"` });
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.error });
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// =============================================================
//   ADMIN ROUTES
// =============================================================

// GET /api/admin/stats
app.get('/api/admin/stats', auth('admin'), async (req, res) => {
    try {
        await withDB(async (conn) => {
            const result = await conn.execute('SELECT * FROM v_admin_stats', {});
            return res.json(mapRow(result));
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/admin/users?role=customer|delivery
app.get('/api/admin/users', auth('admin'), async (req, res) => {
    const { role } = req.query;
    try {
        await withDB(async (conn) => {
            const result = await conn.execute(
                `SELECT id, name, email, phone, role, address, vehicle_type, vehicle_number,
                        deliveries_done, is_active, created_at
                 FROM users
                 WHERE (:role IS NULL OR role = :role) AND role != 'admin'
                 ORDER BY created_at DESC`,
                { role: role || null }
            );
            return res.json(mapRows(result));
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// GET /api/admin/orders  — All orders with customer & delivery info
app.get('/api/admin/orders', auth('admin'), async (req, res) => {
    const { status } = req.query;
    try {
        await withDB(async (conn) => {
            const result = await conn.execute(
                `SELECT * FROM v_order_summary
                 WHERE (:status IS NULL OR order_status = :status)
                 ORDER BY placed_at DESC`,
                { status: status || null }
            );
            return res.json(mapRows(result));
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// PATCH /api/admin/users/:id/suspend  — Suspend / reactivate a user
app.patch('/api/admin/users/:id/suspend', auth('admin'), async (req, res) => {
    const { active } = req.body;  // 0 or 1
    try {
        await withDB(async (conn) => {
            await conn.execute(
                'UPDATE users SET is_active = :active WHERE id = :id',
                { active, id: parseInt(req.params.id) },
                { autoCommit: true }
            );
            return res.json({ message: 'User status updated' });
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// =============================================================
//   PROFILE ROUTES
// =============================================================

// GET /api/profile
app.get('/api/profile', auth(), async (req, res) => {
    try {
        await withDB(async (conn) => {
            const result = await conn.execute(
                `SELECT id, name, email, phone, role, address, vehicle_type,
                        vehicle_number, deliveries_done, created_at
                 FROM users WHERE id = :id`,
                { id: req.user.id }
            );
            if (result.rows.length === 0)
                return res.status(404).json({ error: 'User not found' });
            return res.json(mapRow(result));
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// PATCH /api/profile  — Update name, phone, address
app.patch('/api/profile', auth(), async (req, res) => {
    const { name, phone, address } = req.body;
    try {
        await withDB(async (conn) => {
            await conn.execute(
                `UPDATE users SET
                    name    = NVL(:name,    name),
                    phone   = NVL(:phone,   phone),
                    address = NVL(:address, address)
                 WHERE id = :id`,
                { name: name || null, phone: phone || null, address: address || null, id: req.user.id },
                { autoCommit: true }
            );
            return res.json({ message: 'Profile updated successfully' });
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// =============================================================
//   HELPERS
// =============================================================

// Convert oracledb rows+metaData to array of objects
function mapRows(result) {
    const cols = result.metaData.map(c => c.name);
    return result.rows.map(row => {
        const obj = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
    });
}

function mapRow(result) {
    const rows = mapRows(result);
    return rows.length > 0 ? rows[0] : null;
}

// =============================================================
//   START SERVER
// =============================================================
async function main() {
    try {
        oracledb.outFormat = oracledb.OUT_FORMAT_ARRAY;
        await initPool();
        app.listen(PORT, () => {
            console.log(`\n🚀 QuickBite API Server running on http://localhost:${PORT}`);
            console.log(`📦 Oracle DB: ${DB_CONFIG.connectString}`);
            console.log(`\n  Endpoints:`);
            console.log(`  POST   /api/auth/register`);
            console.log(`  POST   /api/auth/login`);
            console.log(`  GET    /api/menu`);
            console.log(`  GET    /api/restaurant`);
            console.log(`  POST   /api/orders              [customer]`);
            console.log(`  GET    /api/orders/my           [customer]`);
            console.log(`  GET    /api/delivery/pending    [delivery]`);
            console.log(`  PATCH  /api/delivery/orders/:id/accept  [delivery]`);
            console.log(`  PATCH  /api/delivery/orders/:id/status  [delivery]`);
            console.log(`  GET    /api/admin/stats         [admin]`);
            console.log(`  GET    /api/admin/users         [admin]`);
            console.log(`  GET    /api/admin/orders        [admin]`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

main();