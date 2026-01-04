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

// Servir archivos del Frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Base de Datos
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'interfronterasbd',
  password: process.env.DB_PASSWORD || '0534',
  port: 5432,
});

// --- NUEVAS CREDENCIALES (CONFIRMADAS) ---
const EPAYCO_P_CUST_ID = '504560';
const EPAYCO_P_KEY = '4c61cb748710ade08dca87308102ba5a9d91b8fe';

// --- RUTAS ---

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Buscar factura
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

// --- RUTA DE CONFIRMACIÓN (WEBHOOK) ---
// Esta es la ruta que ePayco llamará usando tu URL de Cloudflare
app.post('/api/confirmacion', async (req, res) => {
  try {
      const { x_ref_payco, x_transaction_id, x_amount, x_currency, x_signature, x_cod_response, x_id_invoice } = req.body;

      // 1. Validar firma con tu P_KEY
      const signatureString = `${EPAYCO_P_CUST_ID}^${EPAYCO_P_KEY}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency}`;
      const signatureCalculada = crypto.createHash('sha256').update(signatureString).digest('hex');

      if (signatureCalculada !== x_signature) {
          console.error("Firma inválida - posible fraude");
          return res.status(400).send('Firma fallida');
      }

      // 2. Actualizar pago si es exitoso (Estado 1)
      if (parseInt(x_cod_response) === 1) {
          console.log(`Pago confirmado para factura: ${x_id_invoice}`);
          
          // Como enviamos "ID-TIMESTAMP", recuperamos solo el ID
          const idReal = x_id_invoice.split('-')[0];

          const updateQuery = `
              UPDATE facturas 
              SET estado = 'pagado', 
                  referencia_pago = $1, 
                  fecha_pago = NOW() 
              WHERE id = $2
          `;
          await pool.query(updateQuery, [x_ref_payco, idReal]);
      } 
      
      // Siempre responder OK a ePayco para que no reintente
      res.send('OK');

  } catch (err) {
      console.error("Error en webhook:", err);
      res.status(500).send('Error interno');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});