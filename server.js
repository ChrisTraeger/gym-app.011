require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const cron    = require('node-cron')
const path    = require('path')
const db      = require('./db')

const app  = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'frontend')))

// Rutas
const { router: authRouter } = require('./routes/auth')
app.use('/api/auth',    authRouter)
app.use('/api',         require('./routes/clientes'))

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
})

// Cron: marcar vencidos cada día 8am
cron.schedule('0 8 * * *', () => {
  const hoy = new Date().toISOString().split('T')[0]
  db.run(
    "UPDATE clientes SET estado='vencido' WHERE fecha_vence < ? AND estado='activo'",
    [hoy],
    function() { console.log(`⏰ ${this.changes} cliente(s) marcados como vencidos`) }
  )
})

app.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`)
})