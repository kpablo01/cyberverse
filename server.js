const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
// Configuración de conexión con tu URL pública de Render
const connectionString = 'postgresql://cyberverse_user:Hv4pgpYS2Z3Wc69eu2W8wIrlceARG4Mx@dpg-d6l38dvpm1nc739457pg-a.oregon-postgres.render.com/cyberverse';

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false // Requerido para conectar a Render desde afuera
  }
});

// Verificación de conexión inicial
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error de conexión a la base:', err.stack);
  }
  console.log('Conectado a la base de datos de Render exitosamente');
  release();
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 1. LISTADO GENERAL
app.get('/api/materiales', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM materiales ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. RENTABILIDAD DE CRAFTEO (Considerando Fee 5%)
app.get('/api/rentabilidad', async (req, res) => {
  try {
    const query = `
      SELECT 
        m.id, m.nombre, m.imagen_url,
        COALESCE((SELECT SUM(m_ing.compra * r.cantidad_requerida) FROM recetas r JOIN materiales m_ing ON r.id_ingrediente = m_ing.id WHERE r.id_producto_final = m.id), 0) AS costo_materiales,
        COALESCE((SELECT r.energia_crafteo * (SELECT valor FROM configuracion WHERE clave = 'costo_punto_energia') FROM recetas r WHERE r.id_producto_final = m.id LIMIT 1), 0) AS costo_energia,
        (m.venta * 0.95) - (
          COALESCE((SELECT SUM(m_ing.compra * r.cantidad_requerida) FROM recetas r JOIN materiales m_ing ON r.id_ingrediente = m_ing.id WHERE r.id_producto_final = m.id), 0) + 
          COALESCE((SELECT r.energia_crafteo * (SELECT valor FROM configuracion WHERE clave = 'costo_punto_energia') FROM recetas r WHERE r.id_producto_final = m.id LIMIT 1), 0)
        ) AS ganancia_neta
      FROM materiales m
      WHERE m.id IN (SELECT id_producto_final FROM recetas)
      ORDER BY ganancia_neta DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. ANÁLISIS DE PEDIDOS (Pedido vs Market -5%)
app.get('/api/pedidos-rentables', async (req, res) => {
  try {
    const query = `
      SELECT 
        id, nombre, imagen_url, compra,
        (compra * 1.4) as pago_pedido,
        (venta * 0.95) as neto_market,
        CASE 
          WHEN (compra * 1.4) > (venta * 0.95) THEN 'PEDIDO'
          ELSE 'MARKET'
        END as recomendacion
      FROM materiales 
      WHERE compra > 0 
      AND (id BETWEEN 12 AND 38 OR id IN (51, 60, 61, 62, 71, 72))
      ORDER BY pago_pedido DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. RECETA TOOLTIP
app.get('/api/receta/:id', async (req, res) => {
  try {
    const query = `
      SELECT m.nombre, m.imagen_url, m.venta, r.cantidad_requerida as cantidad
      FROM recetas r
      JOIN materiales m ON r.id_ingrediente = m.id
      WHERE r.id_producto_final = $1;
    `;
    const result = await pool.query(query, [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. UPDATE PRECIO
app.put('/api/materiales/:id', async (req, res) => {
  try {
    const { venta } = req.body;
    await pool.query('UPDATE materiales SET venta = $1 WHERE id = $2', [venta, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. UPDATE PRECIO MARKET
app.post('/api/update-market-snapshot', async (req, res) => {
  const listings = req.body.ls || [];
  const cutoffDate = new Date('2026-01-01T00:00:00Z');

  // Filtramos en JS antes de mandar a la DB para no procesar de más
  const validListings = listings.filter(l => 
    l.id && l.price && l.amount && 
    new Date(l.date) >= cutoffDate
  );

  if (validListings.length === 0) return res.json({ success: true, processed: 0 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const gameIds = validListings.map(l => parseInt(l.id));
    const prices = validListings.map(l => parseFloat(l.price));
    const amounts = validListings.map(l => parseFloat(l.amount));
    const dates = validListings.map(l => new Date(l.date));

    // 1. DETECTAR VENTAS (Solo de órdenes de 2026)
    const detectSalesQuery = `
      INSERT INTO ventas_detectadas (game_id, cantidad, precio, total_cypx)
      SELECT 
          input.game_id, 
          (m.amount - input.amount), 
          input.price, 
          ((m.amount - input.amount) * input.price)
      FROM UNNEST($1::int[], $2::numeric[], $3::numeric[], $4::timestamptz[]) 
           AS input(game_id, price, amount, listed_at)
      JOIN market_listings m ON m.game_id = input.game_id AND m.listed_at = input.listed_at
      WHERE m.amount > input.amount 
      AND input.listed_at >= '2026-01-01T00:00:00Z';
    `;
    await client.query(detectSalesQuery, [gameIds, prices, amounts, dates]);

    // 2. REEMPLAZAR SNAPSHOT
    await client.query('DELETE FROM market_listings');
    await client.query(`
      INSERT INTO market_listings (game_id, price, amount, listed_at, snapshot_at)
      SELECT * FROM UNNEST($1::int[], $2::numeric[], $3::numeric[], $4::timestamptz[], 
                          array_fill(NOW(), ARRAY[cardinality($1)]))
    `, [gameIds, prices, amounts, dates]);

    // 3. SYNC PRECIOS
    await client.query(`
      UPDATE materiales m
      SET venta = subquery.min_price
      FROM (SELECT game_id, MIN(price) as min_price FROM market_listings GROUP BY game_id) AS subquery
      WHERE m.game_id = subquery.game_id;
    `);

    await client.query('COMMIT');
    res.json({ success: true, processed: validListings.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/market-live', async (req, res) => {
  try {
    const query = `
      SELECT 
        l.game_id,
        m.id AS local_id,
        m.nombre,
        m.imagen_url,
        l.price,
        l.amount,
        l.listed_at,
        l.snapshot_at
      FROM market_listings l
      LEFT JOIN materiales m ON l.game_id = m.game_id
      -- FILTRO INTELIGENTE: Trae todo lo que se actualizó en la última ráfaga (último minuto)
      WHERE l.snapshot_at >= (SELECT MAX(snapshot_at) FROM market_listings) - INTERVAL '1 minute'
      AND l.game_id not in (239,237,235,219,284,220,210,178)
      ORDER BY l.listed_at DESC;
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /api/market-live:', err);
    res.status(500).json({ error: err.message });
  }
});

// Vincular un game_id a un material existente
app.put('/api/materiales/link-game-id/:id', async (req, res) => {
  try {
    const { game_id } = req.body;
    // Validamos que vengan ambos datos
    if (!game_id || !req.params.id) {
        return res.status(400).json({ error: 'Faltan datos (game_id o id)' });
    }
    
    await pool.query('UPDATE materiales SET game_id = $1 WHERE id = $2', [game_id, req.params.id]);
    res.json({ success: true, message: 'Vínculo actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/market-metrics', async (req, res) => {
  try {
    const query = `
      WITH latest_snapshot AS (
        SELECT MAX(snapshot_at) AS latest_ts 
        FROM market_listings
      ),
      current_market AS (
        SELECT 
          game_id,
          MIN(price)              AS current_min_price,
          AVG(price)              AS current_avg_price,
          SUM(amount)             AS current_total_supply,
          COUNT(*)                AS current_active_listings
        FROM market_listings
        WHERE snapshot_at >= (SELECT latest_ts FROM latest_snapshot) - INTERVAL '6 hours'
          AND listed_at >= NOW() - INTERVAL '30 days'
        GROUP BY game_id
        HAVING COUNT(*) >= 3
           AND SUM(amount) >= 20
      ),
      ventas_recent AS (
        SELECT 
          game_id,
          SUM(cantidad)                                   AS volume_units_recent,
          SUM(total_cypx)                                 AS volume_cypx_recent,
          ROUND(SUM(total_cypx)::numeric / NULLIF(SUM(cantidad), 0), 2) AS avg_price_recent,
          MIN(precio)                                     AS min_price_recent,
          MAX(precio)                                     AS max_price_recent,
          COUNT(*)                                        AS sales_count_recent
        FROM ventas_detectadas
        WHERE fecha_deteccion >= NOW() - INTERVAL '7 days'
        GROUP BY game_id
        HAVING COUNT(*) >= 2
           AND SUM(total_cypx) >= 500
      ),
      last_sale AS (
        SELECT 
          game_id,
          precio           AS last_sale_price,
          fecha_deteccion  AS last_sale_date
        FROM (
          SELECT 
            game_id,
            precio,
            fecha_deteccion,
            ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY fecha_deteccion DESC) AS rn
          FROM ventas_detectadas
        ) ranked
        WHERE rn = 1
      ),
      metrics AS (  -- ← CTE nueva para poder usar los aliases en ORDER BY
        SELECT 
          m.nombre,
          m.imagen_url,
          c.game_id,
          ROUND(c.current_min_price, 2)           AS current_min_price,
          ROUND(c.current_avg_price, 2)           AS current_avg_price,
          ROUND(c.current_total_supply)::bigint   AS current_total_supply,
          c.current_active_listings,
          v.avg_price_recent,
          v.min_price_recent,
          v.max_price_recent,
          COALESCE(v.volume_cypx_recent, 0)::bigint  AS volume_cypx_recent,
          COALESCE(v.volume_units_recent, 0)         AS volume_units_recent,
          COALESCE(v.sales_count_recent, 0)          AS sales_count_recent,
          ROUND(l.last_sale_price, 2)                AS last_sale_price,
          l.last_sale_date,
          ROUND(
            CASE WHEN COALESCE(v.avg_price_recent, 0) > 0 
                 THEN ((c.current_min_price - v.avg_price_recent) / v.avg_price_recent) * 100
                 ELSE 0 END, 2
          ) AS desviacion_vs_promedio,
          ROUND(
            CASE WHEN COALESCE(l.last_sale_price, 0) > 0 
                 THEN ((c.current_min_price - l.last_sale_price) / l.last_sale_price) * 100
                 ELSE 0 END, 2
          ) AS desviacion_vs_ultima
        FROM current_market c
        LEFT JOIN ventas_recent v ON c.game_id = v.game_id
        LEFT JOIN last_sale l ON c.game_id = l.game_id
        JOIN materiales m ON c.game_id = m.game_id
        WHERE c.current_active_listings > 0
          AND COALESCE(v.sales_count_recent, 0) >= 2
      )
      SELECT * FROM metrics
      ORDER BY 
        CASE 
          WHEN desviacion_vs_ultima < -20 THEN 1
          WHEN desviacion_vs_ultima > 35  THEN 2
          ELSE 3
        END,
        desviacion_vs_ultima ASC
      LIMIT 20;
    `;

    const result = await pool.query(query);
    res.json(result.rows || []);
  } catch (err) {
    console.error('Error en /api/market-metrics:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json([]);  // ← siempre array para que frontend no rompa
  }
});

app.get('/api/market-history/:game_id', async (req, res) => {
  try {
    const { game_id } = req.params;

    const query = `
      WITH days AS (
        -- Generamos los últimos 30 días (incluso sin datos)
        SELECT generate_series(
          DATE_TRUNC('day', NOW() - INTERVAL '29 days'),
          DATE_TRUNC('day', NOW()),
          '1 day'::interval
        ) AS dia
      ),
      ventas_diarias AS (
        SELECT 
          DATE_TRUNC('day', fecha_deteccion) AS dia,
          COUNT(*)                              AS ventas_count,
          SUM(cantidad)                         AS unidades_vendidas,
          ROUND(AVG(precio)::numeric, 2)        AS precio_promedio_ventas,
          MIN(precio)                           AS precio_min_venta,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio) AS precio_mediana_venta
        FROM ventas_detectadas
        WHERE game_id = $1
          AND fecha_deteccion >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', fecha_deteccion)
      ),
      listados_diarios AS (
        SELECT 
          DATE_TRUNC('day', listed_at) AS dia,
          COUNT(*)                              AS listings_count,
          SUM(amount)                           AS total_amount_listed,
          ROUND(MIN(price)::numeric, 2)         AS min_price_listing,
          ROUND(AVG(price)::numeric, 2)         AS avg_price_listing
        FROM market_listings
        WHERE game_id = $1
          AND listed_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', listed_at)
      ),
      combined AS (
        SELECT 
          d.dia,
          TO_CHAR(d.dia, 'DD/MM')                          AS fecha,
          COALESCE(v.precio_promedio_ventas, l.avg_price_listing) AS precio_promedio,
          COALESCE(v.precio_min_venta, l.min_price_listing)       AS precio_minimo,
          COALESCE(v.precio_mediana_venta, NULL)                  AS precio_mediana,
          COALESCE(v.ventas_count, 0)                             AS ventas,
          COALESCE(l.listings_count, 0)                           AS listados_activos,
          COALESCE(v.unidades_vendidas, 0)                        AS unidades_vendidas
        FROM days d
        LEFT JOIN ventas_diarias  v ON d.dia = v.dia
        LEFT JOIN listados_diarios l ON d.dia = l.dia
      ),
      material_info AS (
        SELECT compra
        FROM materiales
        WHERE game_id = $1
        LIMIT 1
      )
      SELECT 
        c.fecha,
        c.precio_promedio,
        c.precio_minimo,
        c.precio_mediana,
        c.ventas,
        c.listados_activos,
        c.unidades_vendidas,
        COALESCE(m.compra, 0) AS compra
      FROM combined c
      CROSS JOIN material_info m
      ORDER BY c.dia ASC;
    `;

    const result = await pool.query(query, [game_id]);
    
    res.json(result.rows.length > 0 ? result.rows : []);
    
  } catch (err) {
    console.error('Error en /api/market-history:', err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

app.get('/api/market-sales-tracker', async (req, res) => {
  try {
    const query = `
      SELECT 
        m.nombre, 
        m.imagen_url, -- Agregamos la imagen
        v.cantidad as volumen_vendido, 
        v.precio as precio_venta,
        v.fecha_deteccion as ultima_venta
      FROM ventas_detectadas v
      JOIN materiales m ON v.game_id = m.game_id
      ORDER BY v.fecha_deteccion DESC
      LIMIT 10;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) { res.status(500).json([]); }
});

app.get('/api/market-liquidity', async (req, res) => {
  try {
    const query = `
      SELECT 
        game_id, 
        MAX(fecha_deteccion) as ultima_venta_at,
        EXTRACT(EPOCH FROM (NOW() - MAX(fecha_deteccion))) / 60 as minutos_desde_ultima
      FROM ventas_detectadas
      GROUP BY game_id;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) { res.status(500).json([]); }
});

app.listen(3000, () => console.log('Cyberverse Server: OK en puerto 3000'));