require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '../frontend')));

// Base de Datos
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'interfronterasbd',
  password: process.env.DB_PASSWORD || '0534',
  port: 5432,
});

// --- TUS NUEVAS LLAVES (CUENTA PERSONAL) ---
const EPAYCO_P_CUST_ID = '1571073';
const EPAYCO_P_KEY = 'cb1f0393e41c8666f16d6e326943f4469f5e3dec';

// --- RUTAS ---

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Buscar Factura
app.get('/api/facturas/:documento', async (req, res) => {
  const { documento } = req.params;
  try {
    const query = `
      SELECT f.id, f.monto, f.mes_servicio, f.estado, f.fecha_vencimiento, u.nombre_completo 
      FROM facturas f
      JOIN usuarios u ON f.usuario_id = u.id
      WHERE u.documento_id = $1 AND f.estado = 'pendiente';
    `;
    const result = await pool.query(query, [documento]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No hay facturas pendientes.' });
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error del servidor');
  }
});

// CONFIRMACIÓN (Webhook)
app.post('/api/confirmacion', async (req, res) => {
  try {
      const { x_ref_payco, x_transaction_id, x_amount, x_currency, x_signature, x_cod_response, x_id_invoice } = req.body;

      // 1. Validar firma con TU P_KEY nueva
      const signatureString = `${EPAYCO_P_CUST_ID}^${EPAYCO_P_KEY}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency}`;
      const signatureCalculada = crypto.createHash('sha256').update(signatureString).digest('hex');

      if (signatureCalculada !== x_signature) {
          return res.status(400).send('Firma inválida');
      }

      // 2. Actualizar pago
      if (parseInt(x_cod_response) === 1) {
          const idReal = x_id_invoice.split('-')[0];
          const updateQuery = `
              UPDATE facturas 
              SET estado = 'pagado', 
                  referencia_pago = $1, 
                  fecha_pago = NOW() 
              WHERE id = $2
          `;
          await pool.query(updateQuery, [x_ref_payco, idReal]);
          console.log(`Pago confirmado: ${idReal}`);
      } 
      
      res.send('OK');

  } catch (err) {
      console.error("Error webhook:", err);
      res.status(500).send('Error');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});