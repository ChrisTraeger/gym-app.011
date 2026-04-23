// routes/clientes.js — Ahora cada dato está separado por usuario_id
const express = require('express')
const router  = express.Router()
const db      = require('../db')
const { autenticar } = require('./auth')

// Todas las rutas requieren login
router.use(autenticar)

// GET /api/planes
router.get('/planes', (req, res) => {
  db.all('SELECT * FROM planes WHERE usuario_id = ?', [req.usuario.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json(rows)
  })
})

// GET /api/clientes
router.get('/clientes', (req, res) => {
  const { estado } = req.query
  let query  = 'SELECT * FROM clientes WHERE usuario_id = ?'
  let params = [req.usuario.id]
  if (estado) { query += ' AND estado = ?'; params.push(estado) }
  query += ' ORDER BY creado_en DESC'

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json(rows)
  })
})

// POST /api/clientes
router.post('/clientes', (req, res) => {
  const { nombre, telefono, plan_id, fecha_inicio } = req.body
  if (!nombre || !plan_id || !fecha_inicio)
    return res.status(400).json({ error: 'Faltan campos: nombre, plan_id, fecha_inicio' })

  db.get('SELECT * FROM planes WHERE id = ? AND usuario_id = ?', [plan_id, req.usuario.id], (err, plan) => {
    if (err || !plan) return res.status(400).json({ error: 'Plan no encontrado' })

    const vence = new Date(fecha_inicio)
    vence.setDate(vence.getDate() + plan.duracion_dias)
    const fechaVence = vence.toISOString().split('T')[0]

    db.run(
      `INSERT INTO clientes (usuario_id, nombre, telefono, plan, monto, fecha_inicio, fecha_vence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.usuario.id, nombre, telefono || '', plan.nombre, plan.precio, fecha_inicio, fechaVence],
      function(err) {
        if (err) return res.status(500).json({ error: err.message })
        db.get('SELECT * FROM clientes WHERE id = ?', [this.lastID], (err, row) => {
          res.status(201).json(row)
        })
      }
    )
  })
})

// PUT /api/clientes/:id — Editar/renovar
router.put('/clientes/:id', (req, res) => {
  const { plan_id, fecha_inicio } = req.body

  db.get('SELECT * FROM clientes WHERE id = ? AND usuario_id = ?', [req.params.id, req.usuario.id], (err, cliente) => {
    if (err || !cliente) return res.status(404).json({ error: 'Cliente no encontrado' })

    db.get('SELECT * FROM planes WHERE id = ? AND usuario_id = ?', [plan_id, req.usuario.id], (err, plan) => {
      if (err || !plan) return res.status(400).json({ error: 'Plan no encontrado' })

      const vence = new Date(fecha_inicio)
      vence.setDate(vence.getDate() + plan.duracion_dias)
      const fechaVence = vence.toISOString().split('T')[0]

      db.run(
        `UPDATE clientes SET plan=?, monto=?, fecha_inicio=?, fecha_vence=?, estado='activo'
         WHERE id = ? AND usuario_id = ?`,
        [plan.nombre, plan.precio, fecha_inicio, fechaVence, req.params.id, req.usuario.id],
        function(err) {
          if (err) return res.status(500).json({ error: err.message })
          db.get('SELECT * FROM clientes WHERE id = ?', [req.params.id], (err, row) => {
            res.json(row)
          })
        }
      )
    })
  })
})

// DELETE /api/clientes/:id
router.delete('/clientes/:id', (req, res) => {
  db.run('DELETE FROM clientes WHERE id = ? AND usuario_id = ?',
    [req.params.id, req.usuario.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ ok: true })
    }
  )
})

// GET /api/stats
router.get('/stats', (req, res) => {
  const hoy = new Date().toISOString().split('T')[0]
  const uid = req.usuario.id
  const stats = {}

  db.get("SELECT COUNT(*) as n FROM clientes WHERE usuario_id=? AND estado='activo'", [uid], (err, r) => {
    stats.totalActivos = r?.n || 0
    db.get("SELECT COUNT(*) as n FROM clientes WHERE usuario_id=? AND fecha_vence < ?", [uid, hoy], (err, r) => {
      stats.vencidos = r?.n || 0
      db.get(
        `SELECT COALESCE(SUM(monto),0) as total FROM clientes
         WHERE usuario_id=? AND strftime('%Y-%m', fecha_inicio) = strftime('%Y-%m', 'now')`,
        [uid],
        (err, r) => {
          stats.ingresosMes = r?.total || 0
          res.json(stats)
        }
      )
    })
  })
})

module.exports = router

// POST /api/planes — guardar planes desde config
router.post('/planes', (req, res) => {
  const { planes } = req.body
  if (!planes || !Array.isArray(planes))
    return res.status(400).json({ error: 'Se esperaba un array de planes' })

  db.run('DELETE FROM planes WHERE usuario_id = ?', [req.usuario.id], (err) => {
    if (err) return res.status(500).json({ error: err.message })
    const stmt = db.prepare('INSERT INTO planes (usuario_id, nombre, duracion_dias, precio) VALUES (?, ?, ?, ?)')
    planes.forEach(p => stmt.run(req.usuario.id, p.nombre, p.duracion_dias||30, p.precio||0))
    stmt.finalize()
    res.json({ ok: true })
  })
})

// POST /api/config — guardar nombre del gym
router.post('/config', (req, res) => {
  // Por ahora solo confirmamos (el nombre se guarda en localStorage del cliente)
  res.json({ ok: true })
})