const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
})

pool.query(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id         SERIAL PRIMARY KEY,
    gimnasio   TEXT    NOT NULL,
    usuario    TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    rol        TEXT    DEFAULT 'gimnasio',
    creado_en  TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS clientes (
    id           SERIAL PRIMARY KEY,
    usuario_id   INTEGER NOT NULL,
    nombre       TEXT    NOT NULL,
    telefono     TEXT,
    plan         TEXT    NOT NULL,
    monto        REAL    NOT NULL,
    fecha_inicio TEXT    NOT NULL,
    fecha_vence  TEXT    NOT NULL,
    estado       TEXT    DEFAULT 'activo',
    creado_en    TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS planes (
    id            SERIAL PRIMARY KEY,
    usuario_id    INTEGER NOT NULL,
    nombre        TEXT    NOT NULL,
    duracion_dias INTEGER NOT NULL,
    precio        REAL    NOT NULL
  );
`).then(() => console.log('✅ Base de datos lista'))
  .catch(err => console.error('❌ Error DB:', err))

module.exports = {
  get: (sql, params, cb) => {
    if (typeof params === 'function') { cb = params; params = [] }
    pool.query(sql, params)
      .then(r => cb(null, r.rows[0]))
      .catch(e => cb(e))
  },
  all: (sql, params, cb) => {
    if (typeof params === 'function') { cb = params; params = [] }
    pool.query(sql, params)
      .then(r => cb(null, r.rows))
      .catch(e => cb(e))
  },
  run: (sql, params, cb) => {
    if (typeof params === 'function') { cb = params; params = [] }
    pool.query(sql, params)
      .then(r => { if (cb) cb.call({ changes: r.rowCount }, null) })
      .catch(e => { if (cb) cb(e) })
  },
  pool
}