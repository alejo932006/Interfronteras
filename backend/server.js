require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron'); // Importación movida arriba para orden

const app = express();
const PORT = 3000;


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());
app.use('/frontend', express.static(path.join(__dirname, '../frontend')));

// Base de Datos
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'interfronterasbd',
  password: process.env.DB_PASSWORD || '0534',
  port: 5432,
});

    app.get('/', (req, res) => {
        // Ajustado a la nueva estructura: ../frontend/index/index.html
        res.sendFile(path.join(__dirname, '../frontend/index/index.html'));
        });

    app.get('/admin', (req, res) => { // Cambié '/admin.html' a '/admin' por estética, pero funciona igual
        // CORREGIDO: Faltaba una barra '/' después de los dos puntos
        res.sendFile(path.join(__dirname, '../frontend/admin/admin.html'));
        });
    // Mantenemos compatibilidad por si alguien escribe admin.html
    app.get('/admin.html', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/admin/admin.html'));
        });

// --- 1. LOGIN ADMINISTRADOR ---
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
      const result = await pool.query('SELECT * FROM administradores WHERE usuario = $1 AND password = $2', [usuario, password]);
      if (result.rows.length > 0) {
          res.json({ success: true, token: 'admin-ok' });
      } else {
          res.status(401).json({ success: false, message: 'Credenciales inválidas' });
      }
  } catch (err) {
      res.status(500).json({ success: false, error: err.message });
  }
});

// --- 2. OBTENER CLIENTES (Con Búsqueda y Paginación) ---
app.get('/api/clientes', async (req, res) => {
  try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const search = req.query.search || '';
      const offset = (page - 1) * limit;

      let whereClause = '';
      let params = [limit, offset];
      
      if (search) {
          whereClause = `WHERE u.documento_id ILIKE $3 OR u.nombre_completo ILIKE $3`;
          params.push(`%${search}%`);
      }

      // 1. Contar total
      let totalClientes = 0;
      if(search) {
           const resCount = await pool.query(`SELECT COUNT(*) FROM usuarios u WHERE u.documento_id ILIKE $1 OR u.nombre_completo ILIKE $1`, [`%${search}%`]);
           totalClientes = parseInt(resCount.rows[0].count);
      } else {
           const resCount = await pool.query('SELECT COUNT(*) FROM usuarios');
           totalClientes = parseInt(resCount.rows[0].count);
      }
      
      const totalPages = Math.ceil(totalClientes / limit);

      // 2. Consulta principal (Calcula el estado mirando la tabla facturas)
      const query = `
      SELECT 
          u.*,
          f.estado as ultimo_estado,
          f.mes_servicio as ultimo_mes,
          f.fecha_pago as ultima_fecha_pago,
          -- CAMBIO: Calculamos los días de mora de la última factura
            CASE 
                -- Comparamos la fecha actual (sin hora) con la fecha de vencimiento (sin hora)
                WHEN f.estado = 'pendiente' AND CURRENT_DATE > DATE(f.fecha_vencimiento) THEN 
                    (CURRENT_DATE - DATE(f.fecha_vencimiento))::int
                ELSE 0 
            END as dias_mora
      FROM usuarios u
      LEFT JOIN LATERAL (
          SELECT estado, mes_servicio, fecha_pago, fecha_vencimiento -- Agregamos fecha_vencimiento aquí
          FROM facturas
          WHERE usuario_id = u.id
          ORDER BY id DESC
          LIMIT 1
      ) f ON true
      ${whereClause}
      ORDER BY u.id DESC
      LIMIT $1 OFFSET $2
  `;
      
      const result = await pool.query(query, params);

      res.json({
          data: result.rows,
          pagination: { total: totalClientes, page, totalPages }
      });

  } catch (err) {
      console.error(err);
      res.status(500).send('Error obteniendo clientes');
  }
});

// Obtener un solo cliente
app.get('/api/clientes/:id', async (req, res) => {
  const { id } = req.params;
  try {
      const query = `
          SELECT 
              id, 
              nombre_completo, 
              documento_id, 
              email, 
              celular, 
              barrio, 
              direccion, 
              plan_internet, 
              valor_mensual,
              codigo_pppoe, 
              nodo,
              fecha_registro,
              fecha_corte
          FROM usuarios 
          WHERE id = $1
      `;
      const result = await pool.query(query, [id]);
      if (result.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
      res.json(result.rows[0]); 
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error de servidor" });
  }
});

// Editar Cliente
app.put('/api/clientes/:id', async (req, res) => {
  const { id } = req.params;
  const { 
      nombre_completo, documento_id, email, celular, direccion, barrio, 
      plan_internet, valor_mensual, codigo_pppoe, nodo,
      fecha_registro, fecha_corte
  } = req.body;

  try {
      const query = `
          UPDATE usuarios SET 
              nombre_completo = $1, 
              documento_id = $2, 
              email = $3, 
              celular = $4, 
              direccion = $5, 
              barrio = $6, 
              plan_internet = $7, 
              valor_mensual = $8, 
              codigo_pppoe = $9, 
              nodo = $10,
              fecha_registro = $11,
              fecha_corte = $12
          WHERE id = $13
      `;
      
      await pool.query(query, [
          nombre_completo, documento_id, email, celular, direccion, barrio, 
          plan_internet, valor_mensual, codigo_pppoe, nodo, 
          fecha_registro, fecha_corte, 
          id
      ]);

      res.json({ success: true, message: "Cliente actualizado" });
  } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: "Error al actualizar" });
  }
});

// --- 3. REGISTRAR CLIENTE ---
app.post('/api/clientes', async (req, res) => {
  const { 
      nombre_completo, documento_id, email, direccion, 
      plan_internet, celular, barrio, nodo, amarra, 
      codigo_pppoe, valor_mensual, 
      fecha_registro, fecha_corte 
  } = req.body;

  try {
      const query = `
          INSERT INTO usuarios (
              nombre_completo, documento_id, email, direccion, 
              plan_internet, celular, barrio, nodo, amarra, 
              estado_servicio, codigo_pppoe, valor_mensual, 
              fecha_registro, fecha_corte
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVO', $10, $11, $12, $13)
          RETURNING *
      `;
      
      const fechaRegistroFinal = fecha_registro ? fecha_registro : new Date();
      const fechaCorteFinal = fecha_corte ? fecha_corte : null;

      const values = [
          nombre_completo, documento_id, email, direccion, 
          plan_internet, celular, barrio, nodo, amarra, 
          codigo_pppoe, valor_mensual,
          fechaRegistroFinal, 
          fechaCorteFinal
      ];
      
      await pool.query(query, values);
      res.json({ success: true, message: 'Cliente creado exitosamente' });

  } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Error creando cliente: ' + err.message });
  }
});

// --- 4. ELIMINAR CLIENTE ---
app.delete('/api/clientes/:id', async (req, res) => {
  const { id } = req.params;
  try {
      await pool.query('DELETE FROM facturas WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
      res.json({ success: true, message: 'Cliente y sus facturas eliminados' });
  } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Error al eliminar cliente' });
  }
});

// --- 5. BUSCAR FACTURA (Para el Cliente) ---
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

// --- 6. CRON JOB: GENERACIÓN AUTOMÁTICA DE FACTURAS ---
// Cambia '0 0 * * *' por '* * * * *' (5 asteriscos)
cron.schedule('0 0 * * *', async () => {
  console.log("🕛 Revisando cortes de facturación...");

  try {
      // 1. Calcular día en Colombia
      const hoy = new Date();
      const diaCorteHoy = parseInt(hoy.toLocaleDateString('es-CO', { 
          day: 'numeric', 
          timeZone: 'America/Bogota' 
      }));
      
      console.log(`📅 Ejecutando Cron para día: ${diaCorteHoy}`);

      // 2. Consulta SQL usando el parámetro $1
      const usuariosACobrar = await pool.query(`
          SELECT id, valor_mensual 
          FROM usuarios 
          WHERE TRIM(UPPER(estado_servicio)) = 'ACTIVO'
          AND EXTRACT(DAY FROM fecha_corte) = $1
      `, [diaCorteHoy]);

      if (usuariosACobrar.rows.length === 0) {
          console.log("✅ Hoy no hay cortes.");
          return;
      }

      console.log(`⚡ Generando facturas para ${usuariosACobrar.rows.length} usuarios...`);

      // Preparar fechas
      const mesActual = hoy.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' });
      const mesServicioCapitalizado = mesActual.charAt(0).toUpperCase() + mesActual.slice(1);

      const fechaVence = new Date(hoy);

      for (const u of usuariosACobrar.rows) {
          // Validación simple para no duplicar en el cron
          const check = await pool.query("SELECT id FROM facturas WHERE usuario_id = $1 AND mes_servicio = $2", [u.id, mesServicioCapitalizado]);
          
          if(check.rows.length === 0) {
              await pool.query(`
                  INSERT INTO facturas (
                      usuario_id, monto, mes_servicio, estado, fecha_vencimiento, created_at
                  ) VALUES ($1, $2, $3, 'pendiente', $4, NOW())
              `, [u.id, u.valor_mensual, mesServicioCapitalizado, fechaVence]);
          }
      }
      
      console.log("✅ Facturación automática completada.");

  } catch (error) {
      console.error("❌ Error en Cron Job:", error);
  }
});

// --- 7. WEBHOOK: CONFIRMACIÓN DE PAGO EPAYCO ---
app.post('/api/confirmacion', async (req, res) => {
  const { x_cod_response, x_id_invoice, x_extra1 } = req.body;
  
  // x_extra1: ID DE LA FACTURA
  const idFactura = x_extra1; 

  try {
      // Si x_cod_response es 1 (Aprobado)
      if (x_cod_response == 1) {
          
          // Actualizamos la factura a 'pagado'
          // CORRECCIÓN: Usamos 'referencia_pago' que es el nombre real en tu tabla
          await pool.query(`
              UPDATE facturas 
              SET estado = 'pagado', 
                  fecha_pago = NOW(), 
                  referencia_pago = $1 
              WHERE id = $2
          `, [x_id_invoice, idFactura]);
          
          // NOTA: No actualizamos la tabla 'usuarios'. 
          // Al recargar el admin, la consulta JOIN verá que esta factura está pagada y pondrá el estado en VERDE automáticamente.

          console.log(`💰 Factura #${idFactura} pagada. Ref ePayco: ${x_id_invoice}`);
      } else {
          console.log(`⚠️ Pago rechazado o pendiente. Ref: ${x_id_invoice}`);
      }

      res.sendStatus(200); 

  } catch (error) {
      console.error("Error Webhook:", error);
      res.sendStatus(500);
  }
});

// --- RUTA: GENERACIÓN MASIVA MANUAL (Botón del Admin) ---
app.post('/api/facturas/generar-masivo', async (req, res) => {
  console.log("⚡ Ejecutando facturación masiva manual...");

  try {
      // 1. CALCULAMOS EL DÍA EXACTO
      const hoy = new Date();
      const diaCorteHoy = parseInt(hoy.toLocaleDateString('es-CO', { 
          day: 'numeric', 
          timeZone: 'America/Bogota' 
      }));

      console.log(`📅 Buscando clientes con fecha de corte día: ${diaCorteHoy}`);

      // 2. BUSCAMOS CLIENTES (CORRECCIÓN: TRIM e ILIKE para ignorar espacios)
      const query = `
          SELECT id, valor_mensual, nombre_completo 
          FROM usuarios 
          WHERE TRIM(estado_servicio) = 'ACTIVO' 
          AND EXTRACT(DAY FROM fecha_corte) = $1
      `;
      
      const usuariosACobrar = await pool.query(query, [diaCorteHoy]);

      if (usuariosACobrar.rows.length === 0) {
          // Mensaje de depuración útil
          console.log("No se encontraron clientes. Verifica que el día de corte coincida y el estado sea 'ACTIVO'.");
          return res.json({ success: true, count: 0, message: `No hay clientes activos con corte el día ${diaCorteHoy}.` });
      }

      // 3. Preparamos datos
      const mesActual = hoy.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' });
      // Aseguramos formato "Enero de 2026"
      const mesServicioCapitalizado = mesActual.charAt(0).toUpperCase() + mesActual.slice(1);
      
      const fechaVence = new Date(hoy);

      let facturasGeneradas = 0;

      // 4. Generamos las facturas
      for (const u of usuariosACobrar.rows) {
          const checkDuplicado = await pool.query(`
              SELECT id FROM facturas 
              WHERE usuario_id = $1 AND mes_servicio = $2
          `, [u.id, mesServicioCapitalizado]);

          if (checkDuplicado.rows.length === 0) {
              await pool.query(`
                  INSERT INTO facturas (
                      usuario_id, monto, mes_servicio, estado, fecha_vencimiento, created_at
                  ) VALUES ($1, $2, $3, 'pendiente', $4, NOW())
              `, [u.id, u.valor_mensual, mesServicioCapitalizado, fechaVence]);
              
              facturasGeneradas++;
              console.log(`Factura creada para: ${u.nombre_completo}`);
          }
      }

      res.json({ 
          success: true, 
          count: facturasGeneradas, 
          message: `Se generaron ${facturasGeneradas} facturas para el día ${diaCorteHoy}.` 
      });

  } catch (error) {
      console.error("Error manual:", error);
      res.status(500).json({ success: false, error: "Error generando facturas: " + error.message });
  }
});

// --- 8. OBTENER HISTORIAL DE FACTURAS (MULTIFILTRO: FECHA, REFERENCIA Y ESTADO) ---
app.get('/api/admin/facturas', async (req, res) => {
  try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      
      // Filtros recibidos
      const fecha = req.query.fecha || '';
      const referencia = req.query.referencia || '';
      const estado = req.query.estado || ''; // Nuevo filtro

      // Construcción dinámica del WHERE
      let conditions = [];
      let params = [];
      let paramIndex = 1;

      if (fecha) {
        conditions.push(`DATE(f.fecha_pago) = $${paramIndex}`);
        params.push(fecha);
        paramIndex++;
    }

    if (referencia) {
        conditions.push(`f.referencia_pago::text ILIKE $${paramIndex}`);
        params.push(`%${referencia}%`);
        paramIndex++;
    }

    // --- AQUÍ ESTÁ LA CORRECCIÓN ---
    if (estado && estado !== 'todos') {
        if (estado === 'mora') {
            // Mora no es una etiqueta en la BD, es una condición:
            // Está pendiente Y la fecha actual es mayor a la de vencimiento
            conditions.push(`f.estado = 'pendiente' AND CURRENT_DATE > DATE(f.fecha_vencimiento)`);        } else {
            // Para 'pendiente' o 'pagado' buscamos normal
            conditions.push(`f.estado = $${paramIndex}`);
            params.push(estado);
            paramIndex++;
        }
    }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      // 1. Contar total
      const countRes = await pool.query(`SELECT COUNT(*) FROM facturas f ${whereClause}`, params);
      const total = parseInt(countRes.rows[0].count);
      const totalPages = Math.ceil(total / limit);

      // 2. Consulta principal
      const query = `
      SELECT 
          f.id, f.monto, f.mes_servicio, f.estado, f.fecha_vencimiento, f.fecha_pago, f.referencia_pago,
          u.nombre_completo, u.documento_id,
        CASE 
            -- Comparamos la fecha actual (sin hora) con la fecha de vencimiento (sin hora)
            WHEN f.estado = 'pendiente' AND CURRENT_DATE > DATE(f.fecha_vencimiento) THEN 
                (CURRENT_DATE - DATE(f.fecha_vencimiento))::int
            ELSE 0 
        END as dias_mora
      FROM facturas f
      JOIN usuarios u ON f.usuario_id = u.id
      ${whereClause}
      ORDER BY f.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
      
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({
          data: result.rows,
          pagination: { total, page, totalPages }
      });

  } catch (err) {
      console.error(err);
      res.status(500).send('Error obteniendo facturas');
  }
});

// --- 9. ACTUALIZACIÓN MASIVA DE FECHA DE CORTE ---
app.put('/api/clientes/masivo/fecha-corte', async (req, res) => {
  const { ids, fecha_corte } = req.body; // ids es un array: [1, 2, 5, ...]

  if (!ids || ids.length === 0 || !fecha_corte) {
      return res.status(400).json({ success: false, error: "Faltan datos." });
  }

  try {
      // Usamos ANY($1) para actualizar todos los IDs que vengan en la lista
      const query = `
          UPDATE usuarios 
          SET fecha_corte = $1 
          WHERE id = ANY($2::int[])
      `;
      
      await pool.query(query, [fecha_corte, ids]);
      
      res.json({ success: true, message: `Se actualizaron ${ids.length} clientes correctamente.` });

  } catch (error) {
      console.error("Error masivo:", error);
      res.status(500).json({ success: false, error: "Error en actualización masiva." });
  }
});

app.get('/api/test-forzar-mora', async (req, res) => {
    try {
        // 1. Buscamos cualquier factura pendiente
        const busqueda = await pool.query("SELECT id FROM facturas WHERE estado = 'pendiente' LIMIT 1");
        
        if (busqueda.rows.length === 0) {
            return res.send("❌ No tienes facturas pendientes para probar.");
        }
  
        const idFactura = busqueda.rows[0].id;
  
        // 2. Retrasamos su vencimiento 10 días
        await pool.query("UPDATE facturas SET fecha_vencimiento = NOW() - INTERVAL '1 days' WHERE id = $1", [idFactura]);
  
        // MENSAJE CORREGIDO:
        res.send(`
            ✅ ¡Listo! La factura #${idFactura} ahora vence hace 10 días.<br>
            ⚠️ <b>IMPORTANTE:</b> Ve al Admin, filtra por <b>'PENDIENTES'</b> y busca la factura con la alerta roja de MORA.
        `);
  
    } catch (error) {
        res.status(500).send("Error: " + error.message);
    }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});