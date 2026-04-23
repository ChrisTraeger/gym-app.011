const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('gym.db')

db.serialize(() => {
  // Tabla usuarios
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    gimnasio   TEXT    NOT NULL,
    usuario    TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    rol        TEXT    DEFAULT 'gimnasio',
    creado_en  TEXT    DEFAULT (datetime('now'))
  )`)

  // Tabla clientes — ahora tiene usuario_id para separar por gimnasio
  db.run(`CREATE TABLE IF NOT EXISTS clientes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id   INTEGER NOT NULL,
    nombre       TEXT    NOT NULL,
    telefono     TEXT,
    plan         TEXT    NOT NULL,
    monto        REAL    NOT NULL,
    fecha_inicio TEXT    NOT NULL,
    fecha_vence  TEXT    NOT NULL,
    estado       TEXT    DEFAULT 'activo',
    creado_en    TEXT    DEFAULT (datetime('now'))
  )`)

  // Tabla planes — también por usuario
  db.run(`CREATE TABLE IF NOT EXISTS planes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id    INTEGER NOT NULL,
    nombre        TEXT    NOT NULL,
    duracion_dias INTEGER NOT NULL,
    precio        REAL    NOT NULL
  )`)

  console.log('✅ Base de datos lista')
})

module.exports = db