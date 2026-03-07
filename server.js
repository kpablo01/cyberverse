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

  const validListings = listings.filter(l => 
    l.id && l.price && l.amount && 
    typeof l.date === 'number' && 
    new Date(l.date) >= cutoffDate
  );

  if (validListings.length === 0) {
    return res.json({ success: true, processed: 0, message: 'Nada válido para procesar' });
  }

  const gameIds = validListings.map(l => parseInt(l.id));
  const prices = validListings.map(l => parseFloat(l.price));
  const amounts = validListings.map(l => parseFloat(l.amount));
  const dates = validListings.map(l => new Date(l.date));

  const client = await pool.connect(); // Usamos un cliente para asegurar que ambas tareas se completen

  try {
    await client.query('BEGIN'); // Iniciamos transacción

    // 1. Insertamos o Actualizamos los listings en market_listings
    const insertQuery = `
      INSERT INTO market_listings (game_id, price, amount, listed_at, snapshot_at)
      SELECT * FROM UNNEST($1::int[], $2::numeric[], $3::numeric[], $4::timestamptz[], array_fill(NOW(), ARRAY[cardinality($1)]))
      ON CONFLICT (listed_at) 
      DO UPDATE SET 
        price = EXCLUDED.price,
        amount = EXCLUDED.amount,
        game_id = EXCLUDED.game_id,
        snapshot_at = NOW();
    `;
    await client.query(insertQuery, [gameIds, prices, amounts, dates]);

    // 2. ACTUALIZACIÓN AUTOMÁTICA: 
    // Sincronizamos la tabla materiales con el precio más bajo de la ráfaga actual
    const syncQuery = `
      UPDATE materiales m
      SET venta = subquery.min_price
      FROM (
        SELECT game_id, MIN(price) as min_price
        FROM market_listings
        WHERE snapshot_at >= NOW() - INTERVAL '1 minute'
        AND game_id = ANY($1::int[]) -- Solo actualizamos los IDs que vinieron en este lote
        GROUP BY game_id
      ) AS subquery
      WHERE m.game_id = subquery.game_id;
    `;
    const syncResult = await client.query(syncQuery, [gameIds]);

    await client.query('COMMIT'); // Guardamos todo

    res.json({
      success: true,
      processed: validListings.length,
      updated_materials: syncResult.rowCount,
      message: 'Snapshot guardado y precios actualizados automáticamente'
    });

  } catch (err) {
    await client.query('ROLLBACK'); // Si algo falla, no se rompe nada
    console.error('Error en proceso automático:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release(); // Devolvemos el cliente al pool
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
      AND l.game_id not in (239,237,235,219,284,220,210)
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
      WITH stats_24h AS (
        SELECT 
          game_id, 
          AVG(price) as avg_price_24h,
          MIN(price) as min_price_24h,
          SUM(amount) as total_volume_24h,
          COUNT(*) as listings_count_24h
        FROM market_listings
        WHERE snapshot_at >= NOW() - INTERVAL '24 hours'
        GROUP BY game_id
      ),
      current_market AS (
        SELECT 
          game_id, 
          MIN(price) as current_min_price,
          SUM(amount) as current_total_supply
        FROM market_listings
        WHERE snapshot_at >= (SELECT MAX(snapshot_at) FROM market_listings) - INTERVAL '1 minute'
        GROUP BY game_id
      )
      SELECT 
        m.nombre,
        m.imagen_url,
        c.current_min_price,
        c.current_total_supply,
        s.avg_price_24h,
        s.min_price_24h,
        s.total_volume_24h,
        s.listings_count_24h,
        ((c.current_min_price - s.avg_price_24h) / s.avg_price_24h) * 100 as desviacion_porcentaje
      FROM current_market c
      JOIN stats_24h s ON c.game_id = s.game_id
      JOIN materiales m ON c.game_id = m.game_id
      ORDER BY desviacion_porcentaje ASC;
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// HISTORIAL MENSUAL (30 Días)
app.get('/api/market-history-monthly/:game_id', async (req, res) => {
  try {
    const query = `
      SELECT TO_CHAR(DATE_TRUNC('day', listed_at), 'DD/MM') as fecha, MIN(price) as precio_min, AVG(price) as precio_avg
      FROM market_listings WHERE game_id = $1 AND listed_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', listed_at) ORDER BY DATE_TRUNC('day', listed_at) ASC;`;
    const result = await pool.query(query, [req.params.game_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/market-sales-tracker', async (req, res) => {
  try {
    const query = `
      SELECT m.nombre, COUNT(*) as volumen_vendido, AVG(price) as precio_venta_promedio
      FROM market_listings l
      JOIN materiales m ON l.game_id = m.game_id
      WHERE snapshot_at >= NOW() - INTERVAL '24 hours'
      GROUP BY m.nombre
      LIMIT 10;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.listen(3000, () => console.log('Cyberverse Server: OK en puerto 3000'));