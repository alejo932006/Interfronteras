require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path'); // <--- NUEVO: Para manejar rutas de carpetas
const crypto = require('crypto');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.urlencoded({ extended: true })); 
app.use(express.json());
app.use(cors());

// --- NUEVO: Servir los archivos del Frontend (HTML, CSS, JS) ---
// Esto le dice al servidor: "Busca los archivos visuales en la carpeta de atrás"
app.use(express.static(path.join(__dirname, '../frontend')));

// Conexión a PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'interfronterasbd',
  password: process.env.DB_PASSWORD || '0534',
  port: 5432,
});

// TUS CREDENCIALES DE EPAYCO (Lado Servidor)
const EPAYCO_P_CUST_ID = '504560';
const EPAYCO_P_KEY = '4c61cb748710ade08dca87308102ba5a9d91b8fe';

// --- RUTAS (API) ---

// 1. AHORA LA RUTA PRINCIPAL DEVUELVE EL HTML (LA PÁGINA WEB)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 2. Buscar factura
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

// 3. Simular Pago
app.post('/api/pagar/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("UPDATE facturas SET estado = 'pagado' WHERE id = $1", [id]);
    res.json({ message: 'Pago registrado con éxito.' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al procesar el pago');
  }
});

// --- NUEVO ENDPOINT DE PAGO (SIMULADO) ---

// --- SIMULACIÓN DE PASARELA DE PAGOS (DAVIVIENDA MOCK) ---
app.post('/api/iniciar-pago', async (req, res) => {
  const { facturaId } = req.body;

  console.log(`📡 Iniciando intento de pago para factura #${facturaId}...`);

  try {
    // 1. Verificar que la factura exista y esté pendiente
    const checkQuery = "SELECT * FROM facturas WHERE id = $1 AND estado = 'pendiente'";
    const check = await pool.query(checkQuery, [facturaId]);

    if (check.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Factura ya pagada o inválida' });
    }

    // 2. SIMULACIÓN: Esperamos 2 segundos (como si el banco procesara)
    await new Promise(resolve => setTimeout(resolve, 2000)); 

    // 3. Generamos un código falso de aprobación
    const referenciaFalsa = 'DAV-' + Math.floor(Math.random() * 1000000) + '-TEST';
    
    // 4. Actualizamos la base de datos como "Pagado"
    const updateQuery = `
        UPDATE facturas 
        SET estado = 'pagado', 
            referencia_pago = $1, 
            fecha_pago = NOW() 
        WHERE id = $2
    `;
    await pool.query(updateQuery, [referenciaFalsa, facturaId]);

    console.log(`✅ Pago exitoso simulado: ${referenciaFalsa}`);

    // 5. Respondemos al Frontend
    res.json({ 
        success: true, 
        message: 'Transacción Aprobada', 
        referencia: referenciaFalsa 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error de conexión con el banco' });
  }
});

// --- RUTA DE CONFIRMACIÓN (WEBHOOK) ---
// Esta ruta la llama ePayco automáticamente cuando el pago es exitoso
app.post('/api/confirmacion', async (req, res) => {
  try {
      const { x_ref_payco, x_transaction_id, x_amount, x_currency, x_signature, x_cod_response, x_id_invoice } = req.body;

      // 1. VALIDAR LA FIRMA (Seguridad)
      // Fórmula: p_cust_id_cliente^p_key^x_ref_payco^x_transaction_id^x_amount^x_currency
      const signatureString = `${EPAYCO_P_CUST_ID}^${EPAYCO_P_KEY}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency}`;
      
      const signatureCalculada = crypto.createHash('sha256').update(signatureString).digest('hex');

      if (signatureCalculada !== x_signature) {
          console.error("Firma inválida. Posible intento de fraude.");
          return res.status(400).send('Firma inválida');
      }

      // 2. VERIFICAR EL ESTADO (1 = Aceptada, 3 = Pendiente)
      // Solo actualizamos si es 1 (Aceptada)
      if (parseInt(x_cod_response) === 1) {
          console.log(`Pago recibido para factura #${x_id_invoice}. Ref: ${x_ref_payco}`);

          const updateQuery = `
              UPDATE facturas 
              SET estado = 'pagado', 
                  referencia_pago = $1, 
                  fecha_pago = NOW() 
              WHERE id = $2
          `;
          await pool.query(updateQuery, [x_ref_payco, x_id_invoice]);
          return res.send('OK');
      } else {
          console.log(`Transacción no aprobada o pendiente: ${x_cod_response}`);
          return res.send('OK'); // Respondemos OK a ePayco para que no reintente si no es exitosa
      }

  } catch (err) {
      console.error("Error en confirmación:", err);
      res.status(500).send('Error interno');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor y Web corriendo en http://localhost:${PORT}`);
});