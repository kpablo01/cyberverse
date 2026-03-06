const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const pool = new Pool({
  user: 'postgres', host: 'localhost', database: 'cyberverse',
  password: 'postgres', port: 5432,
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

app.listen(3000, () => console.log('Cyberverse Server: OK en puerto 3000'));