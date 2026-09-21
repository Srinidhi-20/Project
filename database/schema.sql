-- =============================================================
--   QUICKBITE FOOD DELIVERY SYSTEM
--   Oracle SQL*Plus Database Schema
--   Run this file in SQL*Plus:  @schema.sql
-- =============================================================

-- ─────────────────────────────────────────────────────────────
--  DROP existing tables (if re-running setup)
-- ─────────────────────────────────────────────────────────────
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE order_items   CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE orders        CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE menu_items    CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE restaurants   CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE users         CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

-- ─────────────────────────────────────────────────────────────
--  DROP SEQUENCES
-- ─────────────────────────────────────────────────────────────
BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE seq_users';         EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE seq_orders';        EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE seq_order_items';   EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE seq_menu_items';    EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE seq_restaurants';   EXCEPTION WHEN OTHERS THEN NULL; END;
/

-- ─────────────────────────────────────────────────────────────
--  SEQUENCES
-- ─────────────────────────────────────────────────────────────
CREATE SEQUENCE seq_users         START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE seq_orders        START WITH 1001 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE seq_order_items   START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE seq_menu_items    START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE seq_restaurants   START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

-- ─────────────────────────────────────────────────────────────
--  TABLE: users
--  Stores customers, delivery boys, and admin accounts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
    id                  NUMBER          DEFAULT seq_users.NEXTVAL PRIMARY KEY,
    name                VARCHAR2(100)   NOT NULL,
    email               VARCHAR2(150)   NOT NULL,
    phone               VARCHAR2(20)    NOT NULL,
    password_hash       VARCHAR2(255)   NOT NULL,   -- bcrypt hash stored from Node
    role                VARCHAR2(20)    NOT NULL,   -- 'customer' | 'delivery' | 'admin'
    address             VARCHAR2(500),              -- for customers
    vehicle_type        VARCHAR2(50),               -- for delivery boys: Bike/Scooter/Bicycle
    vehicle_number      VARCHAR2(30),               -- for delivery boys: TN 01 AB 1234
    is_active           NUMBER(1)       DEFAULT 1 NOT NULL,
    deliveries_done     NUMBER          DEFAULT 0,
    created_at          TIMESTAMP       DEFAULT SYSTIMESTAMP,
    updated_at          TIMESTAMP       DEFAULT SYSTIMESTAMP,
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_users_role CHECK (role IN ('customer','delivery','admin')),
    CONSTRAINT chk_users_active CHECK (is_active IN (0,1))
);

COMMENT ON TABLE  users               IS 'All platform users: customers, delivery boys, admin';
COMMENT ON COLUMN users.role          IS 'customer | delivery | admin';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash — never store plain text';
COMMENT ON COLUMN users.is_active     IS '1=active, 0=suspended';

-- ─────────────────────────────────────────────────────────────
--  TABLE: restaurants
--  Predefined restaurant data — only one for this system
-- ─────────────────────────────────────────────────────────────
CREATE TABLE restaurants (
    id          NUMBER          DEFAULT seq_restaurants.NEXTVAL PRIMARY KEY,
    name        VARCHAR2(150)   NOT NULL,
    tagline     VARCHAR2(300),
    cuisine     VARCHAR2(200),
    rating      NUMBER(3,1)     DEFAULT 0,
    address     VARCHAR2(400),
    phone       VARCHAR2(20),
    open_time   VARCHAR2(10)    DEFAULT '09:00',
    close_time  VARCHAR2(10)    DEFAULT '23:00',
    min_order   NUMBER(8,2)     DEFAULT 149,
    is_open     NUMBER(1)       DEFAULT 1,
    created_at  TIMESTAMP       DEFAULT SYSTIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
--  TABLE: menu_items
--  Food items — tied to restaurant
-- ─────────────────────────────────────────────────────────────
CREATE TABLE menu_items (
    id              NUMBER          DEFAULT seq_menu_items.NEXTVAL PRIMARY KEY,
    restaurant_id   NUMBER          NOT NULL,
    name            VARCHAR2(150)   NOT NULL,
    description     VARCHAR2(400),
    category        VARCHAR2(80)    NOT NULL,
    price           NUMBER(8,2)     NOT NULL,
    emoji           VARCHAR2(10),
    is_veg          NUMBER(1)       DEFAULT 0,
    is_available    NUMBER(1)       DEFAULT 1,
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP,
    CONSTRAINT fk_menu_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
    CONSTRAINT chk_menu_price     CHECK (price > 0),
    CONSTRAINT chk_menu_veg       CHECK (is_veg IN (0,1)),
    CONSTRAINT chk_menu_avail     CHECK (is_available IN (0,1))
);

COMMENT ON COLUMN menu_items.is_veg IS '1=vegetarian, 0=non-vegetarian';

-- ─────────────────────────────────────────────────────────────
--  TABLE: orders
--  One row per customer order
-- ─────────────────────────────────────────────────────────────
CREATE TABLE orders (
    id                  NUMBER          DEFAULT seq_orders.NEXTVAL PRIMARY KEY,
    customer_id         NUMBER          NOT NULL,
    delivery_boy_id     NUMBER,                         -- assigned after acceptance
    restaurant_id       NUMBER          NOT NULL,
    delivery_address    VARCHAR2(500)   NOT NULL,
    subtotal            NUMBER(10,2)    NOT NULL,
    gst_amount          NUMBER(10,2)    DEFAULT 0,
    delivery_fee        NUMBER(8,2)     DEFAULT 0,
    total_amount        NUMBER(10,2)    NOT NULL,
    payment_method      VARCHAR2(50)    NOT NULL,        -- UPI | Card | NetBanking | COD
    payment_status      VARCHAR2(20)    DEFAULT 'Pending',
    order_status        VARCHAR2(30)    DEFAULT 'Pending',
    placed_at           TIMESTAMP       DEFAULT SYSTIMESTAMP,
    accepted_at         TIMESTAMP,
    picked_at           TIMESTAMP,
    delivered_at        TIMESTAMP,
    cancelled_at        TIMESTAMP,
    cancel_reason       VARCHAR2(300),
    CONSTRAINT fk_order_customer    FOREIGN KEY (customer_id)     REFERENCES users(id),
    CONSTRAINT fk_order_delivery    FOREIGN KEY (delivery_boy_id) REFERENCES users(id),
    CONSTRAINT fk_order_restaurant  FOREIGN KEY (restaurant_id)   REFERENCES restaurants(id),
    CONSTRAINT chk_order_pay_method CHECK (payment_method IN ('UPI','Card','NetBanking','COD')),
    CONSTRAINT chk_order_pay_status CHECK (payment_status IN ('Pending','Paid','Refunded','Failed')),
    CONSTRAINT chk_order_status     CHECK (order_status IN ('Pending','Accepted','Picked Up','Delivered','Cancelled'))
);

COMMENT ON COLUMN orders.order_status    IS 'Pending → Accepted → Picked Up → Delivered | Cancelled';
COMMENT ON COLUMN orders.payment_status  IS 'Pending | Paid | Refunded | Failed';

-- ─────────────────────────────────────────────────────────────
--  TABLE: order_items
--  Line items for each order (normalized)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE order_items (
    id              NUMBER          DEFAULT seq_order_items.NEXTVAL PRIMARY KEY,
    order_id        NUMBER          NOT NULL,
    menu_item_id    NUMBER          NOT NULL,
    item_name       VARCHAR2(150)   NOT NULL,    -- snapshot at time of order
    item_price      NUMBER(8,2)     NOT NULL,    -- snapshot at time of order
    quantity        NUMBER          NOT NULL,
    line_total      NUMBER(10,2)    NOT NULL,    -- item_price * quantity
    CONSTRAINT fk_oi_order     FOREIGN KEY (order_id)      REFERENCES orders(id),
    CONSTRAINT fk_oi_menu_item FOREIGN KEY (menu_item_id)  REFERENCES menu_items(id),
    CONSTRAINT chk_oi_qty      CHECK (quantity > 0)
);

-- ─────────────────────────────────────────────────────────────
--  INDEXES for performance
-- ─────────────────────────────────────────────────────────────
CREATE INDEX idx_users_email         ON users(email);
CREATE INDEX idx_users_role          ON users(role);
CREATE INDEX idx_orders_customer     ON orders(customer_id);
CREATE INDEX idx_orders_delivery     ON orders(delivery_boy_id);
CREATE INDEX idx_orders_status       ON orders(order_status);
CREATE INDEX idx_orders_placed_at    ON orders(placed_at);
CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_menu_restaurant     ON menu_items(restaurant_id);
CREATE INDEX idx_menu_category       ON menu_items(category);

-- ─────────────────────────────────────────────────────────────
--  TRIGGER: auto-update users.updated_at
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

-- ─────────────────────────────────────────────────────────────
--  TRIGGER: auto-calculate order line_total
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_order_items_total
    BEFORE INSERT OR UPDATE ON order_items
    FOR EACH ROW
BEGIN
    :NEW.line_total := :NEW.item_price * :NEW.quantity;
END;
/

-- ─────────────────────────────────────────────────────────────
--  TRIGGER: increment deliveries_done on delivery
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_order_delivered
    AFTER UPDATE OF order_status ON orders
    FOR EACH ROW
    WHEN (NEW.order_status = 'Delivered' AND OLD.order_status != 'Delivered')
BEGIN
    UPDATE users
    SET deliveries_done = deliveries_done + 1
    WHERE id = :NEW.delivery_boy_id;
END;
/

-- ─────────────────────────────────────────────────────────────
--  STORED PROCEDURE: place_order
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE place_order (
    p_customer_id       IN  orders.customer_id%TYPE,
    p_restaurant_id     IN  orders.restaurant_id%TYPE,
    p_delivery_address  IN  orders.delivery_address%TYPE,
    p_subtotal          IN  orders.subtotal%TYPE,
    p_gst               IN  orders.gst_amount%TYPE,
    p_delivery_fee      IN  orders.delivery_fee%TYPE,
    p_total             IN  orders.total_amount%TYPE,
    p_pay_method        IN  orders.payment_method%TYPE,
    p_pay_status        IN  orders.payment_status%TYPE,
    p_order_id          OUT orders.id%TYPE
) AS
BEGIN
    INSERT INTO orders (
        customer_id, restaurant_id, delivery_address,
        subtotal, gst_amount, delivery_fee, total_amount,
        payment_method, payment_status, order_status
    ) VALUES (
        p_customer_id, p_restaurant_id, p_delivery_address,
        p_subtotal, p_gst, p_delivery_fee, p_total,
        p_pay_method, p_pay_status, 'Pending'
    ) RETURNING id INTO p_order_id;
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END place_order;
/

-- ─────────────────────────────────────────────────────────────
--  STORED PROCEDURE: update_order_status
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE update_order_status (
    p_order_id      IN orders.id%TYPE,
    p_new_status    IN orders.order_status%TYPE,
    p_delivery_id   IN orders.delivery_boy_id%TYPE DEFAULT NULL
) AS
BEGIN
    UPDATE orders
    SET
        order_status    = p_new_status,
        delivery_boy_id = NVL(p_delivery_id, delivery_boy_id),
        accepted_at     = CASE WHEN p_new_status = 'Accepted'  THEN SYSTIMESTAMP ELSE accepted_at  END,
        picked_at       = CASE WHEN p_new_status = 'Picked Up' THEN SYSTIMESTAMP ELSE picked_at    END,
        delivered_at    = CASE WHEN p_new_status = 'Delivered' THEN SYSTIMESTAMP ELSE delivered_at END,
        cancelled_at    = CASE WHEN p_new_status = 'Cancelled' THEN SYSTIMESTAMP ELSE cancelled_at END,
        payment_status  = CASE WHEN p_new_status = 'Delivered' THEN 'Paid' ELSE payment_status END
    WHERE id = p_order_id;
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END update_order_status;
/

-- ─────────────────────────────────────────────────────────────
--  VIEW: v_order_summary
--  Used by admin dashboard and order list pages
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_order_summary AS
SELECT
    o.id                AS order_id,
    o.order_status,
    o.payment_method,
    o.payment_status,
    o.total_amount,
    o.placed_at,
    o.delivered_at,
    c.id                AS customer_id,
    c.name              AS customer_name,
    c.phone             AS customer_phone,
    d.id                AS delivery_boy_id,
    d.name              AS delivery_boy_name,
    d.phone             AS delivery_boy_phone,
    o.delivery_address,
    r.name              AS restaurant_name
FROM orders       o
JOIN users        c ON o.customer_id     = c.id
LEFT JOIN users   d ON o.delivery_boy_id = d.id
JOIN restaurants  r ON o.restaurant_id   = r.id;

-- ─────────────────────────────────────────────────────────────
--  VIEW: v_pending_orders
--  Delivery boy dashboard — unassigned orders
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_pending_orders AS
SELECT
    o.id            AS order_id,
    o.delivery_address,
    o.total_amount,
    o.payment_method,
    o.placed_at,
    c.name          AS customer_name,
    c.phone         AS customer_phone,
    r.name          AS restaurant_name
FROM orders       o
JOIN users        c ON o.customer_id    = c.id
JOIN restaurants  r ON o.restaurant_id  = r.id
WHERE o.order_status = 'Pending'
ORDER BY o.placed_at ASC;

-- ─────────────────────────────────────────────────────────────
--  VIEW: v_admin_stats
--  Quick stats for admin dashboard
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_admin_stats AS
SELECT
    (SELECT COUNT(*) FROM users WHERE role = 'customer')             AS total_customers,
    (SELECT COUNT(*) FROM users WHERE role = 'delivery')             AS total_delivery_boys,
    (SELECT COUNT(*) FROM orders)                                    AS total_orders,
    (SELECT COUNT(*) FROM orders WHERE order_status = 'Pending')     AS pending_orders,
    (SELECT COUNT(*) FROM orders WHERE order_status = 'Delivered')   AS delivered_orders,
    (SELECT NVL(SUM(total_amount),0) FROM orders
     WHERE order_status = 'Delivered')                               AS total_revenue
FROM DUAL;

-- ─────────────────────────────────────────────────────────────
--  SEED DATA — Restaurant (predefined, do not change)
-- ─────────────────────────────────────────────────────────────
INSERT INTO restaurants (name, tagline, cuisine, rating, address, phone, min_order)
VALUES (
    'Spice Garden',
    'Authentic flavors, delivered with love',
    'Indian, Chinese, Continental',
    4.7,
    '12, Anna Salai, Salem, Tamil Nadu - 636001',
    '+91 99876 54321',
    149
);

-- ─────────────────────────────────────────────────────────────
--  SEED DATA — Menu Items (predefined)
-- ─────────────────────────────────────────────────────────────
INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Butter Chicken','Tender chicken in rich tomato-butter gravy','Main Course',260,'🍛',0);

INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Paneer Tikka Masala','Grilled paneer in spicy masala sauce','Main Course',230,'🧆',1);

INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Veg Biryani','Fragrant basmati rice with vegetables and spices','Rice',180,'🍚',1);

INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Chicken Biryani','Dum-cooked chicken biryani, chef special','Rice',240,'🍗',0);

INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Dal Makhani','Slow-cooked black lentils in creamy gravy','Main Course',190,'🥘',1);

INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Cheese Garlic Naan','Fluffy naan with melted cheese and garlic','Bread',80,'🫓',1);

INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Spring Rolls','Crispy fried rolls with veg filling','Starters',140,'🥢',1);

INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Chicken Manchurian','Indo-Chinese crispy chicken in Manchurian sauce','Starters',200,'🍢',0);

INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Mango Lassi','Chilled yogurt drink with fresh mango','Drinks',90,'🥭',1);

INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Gulab Jamun','Soft milk-solid dumplings in rose syrup','Desserts',80,'🍮',1);

INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Masala Chai','Indian spiced tea with ginger and cardamom','Drinks',60,'🍵',1);

INSERT INTO menu_items (restaurant_id, name, description, category, price, emoji, is_veg)
VALUES (1,'Pasta Arrabiata','Penne pasta in spicy tomato sauce','Main Course',210,'🍝',1);

-- Admin user (password: admin123 — bcrypt hash stored, plain shown for reference)
-- In real setup, run: node -e "const b=require('bcryptjs');console.log(b.hashSync('admin123',10))"
-- and replace the hash below
INSERT INTO users (name, email, phone, password_hash, role, address)
VALUES (
    'Administrator',
    'admin@quickbite.com',
    '+91 00000 00000',
    '$2a$10$H0w0UrcJpBxV/Kn62J7jVOTzEd0Dyk1eip9Jwj46qQAmepvgtqury',
    'admin',
    'QuickBite HQ, Salem'
);

COMMIT;

-- ─────────────────────────────────────────────────────────────
--  USEFUL QUERIES (for SQL*Plus testing)
-- ─────────────────────────────────────────────────────────────

-- List all users by role:
-- SELECT id, name, email, role, created_at FROM users ORDER BY role, created_at;

-- View admin stats:
-- SELECT * FROM v_admin_stats;

-- View all orders with customer and delivery info:
-- SELECT order_id, customer_name, delivery_boy_name, order_status, total_amount, placed_at
-- FROM v_order_summary ORDER BY placed_at DESC;

-- View pending orders for delivery boys:
-- SELECT * FROM v_pending_orders;

-- Revenue by payment method:
-- SELECT payment_method, COUNT(*) AS total_orders, SUM(total_amount) AS revenue
-- FROM orders WHERE order_status = 'Delivered'
-- GROUP BY payment_method ORDER BY revenue DESC;

-- Top customers by spending:
-- SELECT u.name, u.email, COUNT(o.id) AS orders, SUM(o.total_amount) AS spent
-- FROM users u JOIN orders o ON u.id = o.customer_id
-- WHERE o.order_status = 'Delivered'
-- GROUP BY u.name, u.email ORDER BY spent DESC;

PROMPT =============================================================
PROMPT   QuickBite Oracle Schema created successfully!
PROMPT   Tables: users, restaurants, menu_items, orders, order_items
PROMPT   Views:  v_order_summary, v_pending_orders, v_admin_stats
PROMPT   Procs:  place_order, update_order_status
PROMPT   Seed:   1 restaurant, 12 menu items, 1 admin user
PROMPT =============================================================