// routes/auth.js — Registro, login, y middleware de autenticación
const express = require('express')
const router  = express.Router()
const db      = require('../db')
const crypto  = require('crypto')

// Hash simple de contraseña (sin dependencias extra)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'gym_salt_2026').digest('hex')
}

// Generar token simple
function generarToken(userId) {
  const payload = `${userId}:${Date.now()}:${Math.random()}`
  return crypto.createHash('sha256').update(payload).digest('hex')
}

// Guardar tokens activos en memoria (en producción usarías Redis o BD)
const tokensActivos = new Map()

// ── MIDDLEWARE: verificar token ──────────────────────────
function autenticar(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '')
  if (!token || !tokensActivos.has(token)) {
    return res.status(401).json({ error: 'No autorizado. Inicia sesión.' })
  }
  req.usuario = tokensActivos.get(token)
  next()
}

// ── POST /api/auth/registro ──────────────────────────────
router.post('/registro', (req, res) => {
  const { gimnasio, usuario, password } = req.body

  if (!gimnasio || !usuario || !password)
    return res.status(400).json({ error: 'Faltan campos: gimnasio, usuario, password' })

  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })

  const hash = hashPassword(password)

  db.run(
    'INSERT INTO usuarios (gimnasio, usuario, password) VALUES (?, ?, ?)',
    [gimnasio, usuario.toLowerCase(), hash],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE'))
          return res.status(400).json({ error: 'Ese usuario ya existe' })
        return res.status(500).json({ error: err.message })
      }

      // Crear planes por defecto para este usuario
      const uid = this.lastID
      const stmt = db.prepare('INSERT INTO planes (usuario_id, nombre, duracion_dias, precio) VALUES (?, ?, ?, ?)')
      stmt.run(uid, 'Mensual',    30,  50000)
      stmt.run(uid, 'Trimestral', 90,  130000)
      stmt.run(uid, 'Semestral',  180, 240000)
      stmt.finalize()

      res.status(201).json({ ok: true, mensaje: 'Cuenta creada. Ya puedes iniciar sesión.' })
    }
  )
})

// ── POST /api/auth/login ─────────────────────────────────
router.post('/login', (req, res) => {
  const { usuario, password } = req.body

  if (!usuario || !password)
    return res.status(400).json({ error: 'Faltan usuario y contraseña' })

  const hash = hashPassword(password)

  db.get(
    'SELECT * FROM usuarios WHERE usuario = ? AND password = ?',
    [usuario.toLowerCase(), hash],
    (err, user) => {
      if (err || !user)
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })

      const token = generarToken(user.id)
      tokensActivos.set(token, { id: user.id, usuario: user.usuario, gimnasio: user.gimnasio, rol: user.rol })

      res.json({ token, gimnasio: user.gimnasio, usuario: user.usuario })
    }
  )
})

// ── POST /api/auth/logout ────────────────────────────────
router.post('/logout', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '')
  if (token) tokensActivos.delete(token)
  res.json({ ok: true })
})



// POST /api/auth/cambiar-pass
router.post('/cambiar-pass', autenticar, (req, res) => {
  const { password } = req.body
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Mínimo 6 caracteres' })
  const hash = hashPassword(password)
  db.run('UPDATE usuarios SET password = ? WHERE id = ?', [hash, req.usuario.id], function(err) {
    if (err) return res.status(500).json({ error: err.message })
    res.json({ ok: true })
  })
})

module.exports = { router, autenticar }