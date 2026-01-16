require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron'); // Importación movida arriba para orden
const Mikronode = require('mikronode'); // <--- NUEVO

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

// --- 2. OBTENER CLIENTES (Con Filtros de Estado) ---
app.get('/api/clientes', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        const estadoFilter = req.query.estado || 'todos'; // Nuevo filtro
        const offset = (page - 1) * limit;
  
        // Construcción dinámica de condiciones
        let conditions = [];
        let params = [];
        let paramIndex = 1;
  
        // Filtro de búsqueda (Texto)
        if (search) {
            conditions.push(`(u.documento_id ILIKE $${paramIndex} OR u.nombre_completo ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }
  
        // Filtro de Estado (Desde el Dashboard)
        if (estadoFilter === 'mora') {
            conditions.push(`EXISTS (SELECT 1 FROM facturas f WHERE f.usuario_id = u.id AND f.estado = 'pendiente' AND CURRENT_DATE > DATE(f.fecha_vencimiento))`);
        } else if (estadoFilter === 'sindatos') {
            conditions.push(`NOT EXISTS (SELECT 1 FROM facturas f WHERE f.usuario_id = u.id)`);
        } else if (estadoFilter === 'aldia') {
            // Tiene facturas Y ninguna está vencida
            conditions.push(`EXISTS (SELECT 1 FROM facturas f WHERE f.usuario_id = u.id) AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.usuario_id = u.id AND f.estado = 'pendiente' AND CURRENT_DATE > DATE(f.fecha_vencimiento))`);
        }
  
        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  
        // 1. Contar total con filtros
        const resCount = await pool.query(`SELECT COUNT(*) FROM usuarios u ${whereClause}`, params);
        const totalClientes = parseInt(resCount.rows[0].count);
        const totalPages = Math.ceil(totalClientes / limit);
  
        // 2. Consulta principal
        const query = `
            SELECT 
                u.*,
                f.estado as ultimo_estado,
                f.mes_servicio as ultimo_mes,
                CASE 
                    WHEN f.estado = 'pendiente' AND CURRENT_DATE > DATE(f.fecha_vencimiento) THEN 
                        (CURRENT_DATE - DATE(f.fecha_vencimiento))::int
                    ELSE 0 
                END as dias_mora
            FROM usuarios u
            LEFT JOIN LATERAL (
                SELECT estado, mes_servicio, fecha_vencimiento 
                FROM facturas
                WHERE usuario_id = u.id
                ORDER BY id DESC
                LIMIT 1
            ) f ON true
            ${whereClause}
            ORDER BY u.id DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        
        params.push(limit, offset);
        
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

// --- CRON JOB: CORTES AUTOMÁTICOS (Cada hora: 0 * * * *) ---
cron.schedule('0 * * * *', async () => {
    console.log("✂️ Verificando cortes por mora...");
    
    // Buscar clientes ACTIVOS que tengan facturas VENCIDAS pendientes
    const clientesParaCorte = await pool.query(`
        SELECT u.id, u.nombre_completo, u.codigo_pppoe 
        FROM usuarios u
        WHERE u.estado_servicio = 'ACTIVO'
        AND EXISTS (
            SELECT 1 FROM facturas f 
            WHERE f.usuario_id = u.id 
            AND f.estado = 'pendiente' 
            AND CURRENT_DATE > DATE(f.fecha_vencimiento)
        )
    `);

    if (clientesParaCorte.rows.length > 0) {
        console.log(`Detectados ${clientesParaCorte.rows.length} clientes para corte.`);
        
        for (const cliente of clientesParaCorte.rows) {
            // CAMBIO: Pasamos el ID del cliente, no el pppoe directo
            await cambiarEstadoMikrotik(cliente.id, false); // false = Desactivar
            
            // Actualizamos BD
            await pool.query("UPDATE usuarios SET estado_servicio = 'SUSPENDIDO', ultimo_corte = NOW() WHERE id = $1", [cliente.id]);
            console.log(`⛔ Cliente SUSPENDIDO: ${cliente.nombre_completo}`);
        }
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
            
            // 1. Actualizamos la factura a 'pagado'
            await pool.query(`
                UPDATE facturas 
                SET estado = 'pagado', 
                    fecha_pago = NOW(), 
                    referencia_pago = $1 
                WHERE id = $2
            `, [x_id_invoice, idFactura]);
            
            console.log(`💰 Factura #${idFactura} pagada. Ref ePayco: ${x_id_invoice}`);
  
            // 2. AQUI ES DONDE DEBE IR LA REACTIVACIÓN (Solo si pagó)
            // Buscamos al usuario dueño de la factura para ver si estaba suspendido
            const userRes = await pool.query(`
              SELECT u.id, u.codigo_pppoe, u.estado_servicio 
              FROM usuarios u 
              JOIN facturas f ON f.usuario_id = u.id 
              WHERE f.id = $1
            `, [idFactura]);
      
            if(userRes.rows.length > 0) {
              const usuario = userRes.rows[0];
              // Si estaba suspendido, lo reactivamos en Mikrotik y BD
              if(usuario.estado_servicio === 'SUSPENDIDO') {
                // CAMBIO: Pasamos usuario.id en lugar de usuario.codigo_pppoe
                await cambiarEstadoMikrotik(usuario.id, true); // true = Activar
                
                await pool.query("UPDATE usuarios SET estado_servicio = 'ACTIVO' WHERE id = $1", [usuario.id]);
                console.log(`✅ Servicio REACTIVADO automáticamente para usuario ID ${usuario.id}`);
            }
            }
  
        } else {
            // Si el pago falló, solo registramos el log. ¡No reactivamos nada!
            console.log(`⚠️ Pago rechazado o pendiente. Ref: ${x_id_invoice}`);
        }
  
        res.sendStatus(200); 
  
    } catch (error) {
        console.error("Error Webhook:", error);
        res.sendStatus(500);
    }
  });

// --- FUNCIONES MIKROTIK ---

// --- FUNCIONES MIKROTIK (MULTI-NODO) ---

// Función Auxiliar: Ejecutar comando en un Router específico
async function ejecutarEnMikrotik(configNodo, pppoeName, activar) {
    return new Promise((resolve, reject) => {
        if (!configNodo || !configNodo.ip_mikrotik) {
            console.log(`⚠️ Nodo no configurado o sin IP. Saltando ${pppoeName}.`);
            return resolve({ success: false, message: "Nodo sin configuración Mikrotik" });
        }

        // Conectamos a la IP específica de este nodo
        const device = new Mikronode(configNodo.ip_mikrotik, parseInt(configNodo.puerto_api) || 8728);
        
        device.connect()
            .then(([login]) => login(configNodo.usuario_api, configNodo.password_api))
            .then(function(conn) {
                const chan = conn.openChannel("ppp_action");
                const action = activar ? 'enable' : 'disable';
                
                console.log(`🔌 Conectando a Nodo [${configNodo.nombre_nodo}] (${configNodo.ip_mikrotik}) para ${action} usuario ${pppoeName}...`);

                // 1. Buscar ID del secret
                chan.write('/ppp/secret/print', { '?name': pppoeName });

                chan.on('done', function(data) {
                    const parsed = Mikronode.parseItems(data);
                    if (parsed.length > 0) {
                        const id = parsed[0]['.id'];
                        // 2. Activar/Desactivar
                        chan.write(`/ppp/secret/${action}`, { '.id': id });
                        
                        // 3. Si es corte (desactivar), tumbar conexión activa para que caiga inmediato
                        if (!activar) {
                             const chanActive = conn.openChannel("kill_active");
                             chanActive.write('/ppp/active/print', { '?name': pppoeName });
                             chanActive.on('done', (d) => {
                                 const actives = Mikronode.parseItems(d);
                                 actives.forEach(a => {
                                     chanActive.write('/ppp/active/remove', { '.id': a['.id'] });
                                 });
                                 chanActive.close();
                             });
                        }
                        resolve({ success: true });
                    } else {
                        console.log(`❌ Usuario PPPoE ${pppoeName} no encontrado en router ${configNodo.nombre_nodo}.`);
                        resolve({ success: false, message: "Usuario no encontrado en Router" });
                    }
                    chan.close();
                    conn.close();
                });
            })
            .catch(err => {
                console.error(`❌ Error conexión Nodo [${configNodo.nombre_nodo}]:`, err.message);
                resolve({ success: false, error: err.message });
            });
    });
}

// Función Principal: Busca el nodo del usuario en la BD y ejecuta la acción
async function cambiarEstadoMikrotik(usuarioId, activar) {
    try {
        // JOIN entre usuarios y la nueva tabla routers_nodos
        const query = `
            SELECT u.codigo_pppoe, r.nombre_nodo, r.ip_mikrotik, r.usuario_api, r.password_api, r.puerto_api
            FROM usuarios u
            LEFT JOIN routers_nodos r ON u.nodo = r.nombre_nodo
            WHERE u.id = $1
        `;
        const res = await pool.query(query, [usuarioId]);
        
        if(res.rows.length === 0) return { success: false, message: "Usuario no encontrado" };
        
        const datos = res.rows[0];
        
        // Si el cliente tiene un nodo, pero ese nodo no está en la tabla de routers
        if(!datos.ip_mikrotik) {
            console.log(`⚠️ El usuario ${datos.codigo_pppoe} es del nodo '${datos.nodo}' pero no hay router configurado para esa zona.`);
            return { success: false, message: "Nodo no configurado" };
        }

        return await ejecutarEnMikrotik(datos, datos.codigo_pppoe, activar);

    } catch (err) {
        console.error("Error buscando datos mikrotik:", err);
        return { success: false, error: err.message };
    }
}

// --- API MIKROTIK ---

// --- API GESTIÓN DE NODOS (ROUTERS) ---

// Listar todos los nodos configurados
app.get('/api/nodos', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM routers_nodos ORDER BY nombre_nodo ASC");
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Guardar o Actualizar un Nodo
app.post('/api/nodos', async (req, res) => {
    const { nombre_nodo, ip, user, pass, port } = req.body;
    try {
        // Verificar si ya existe un router para este nombre de nodo
        const check = await pool.query("SELECT id FROM routers_nodos WHERE nombre_nodo = $1", [nombre_nodo]);
        
        if(check.rows.length > 0) {
            // Actualizar existente
            await pool.query(
                "UPDATE routers_nodos SET ip_mikrotik=$1, usuario_api=$2, password_api=$3, puerto_api=$4 WHERE nombre_nodo=$5",
                [ip, user, pass, port, nombre_nodo]
            );
        } else {
            // Crear nuevo
            await pool.query(
                "INSERT INTO routers_nodos (nombre_nodo, ip_mikrotik, usuario_api, password_api, puerto_api) VALUES ($1, $2, $3, $4, $5)",
                [nombre_nodo, ip, user, pass, port]
            );
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Eliminar configuración de un Nodo
app.delete('/api/nodos/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM routers_nodos WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- PEGAR ESTO (NUEVO) ---
// Ruta para probar conexión manual (Recibe IP, User, Pass desde el formulario)
app.post('/api/nodos/test', async (req, res) => {
    const { ip, user, pass, port } = req.body;
    
    if(!ip || !user || !pass) {
        return res.json({ success: false, error: "Faltan datos (IP, Usuario o Clave)" });
    }

    try {
        console.log(`🧪 Probando conexión a ${ip}...`);
        // Usamos los datos que nos envía el frontend, NO los de la BD
        const device = new Mikronode(ip, parseInt(port) || 8728);
        
        const [login] = await device.connect();
        const conn = await login(user, pass);
        
        conn.close();
        device.close();
        
        res.json({ success: true, message: "¡Conexión Exitosa con Mikrotik!" });

    } catch (e) {
        console.error("❌ Error Test Mikrotik:", e.message);
        res.json({ success: false, error: "Fallo al conectar: " + e.message });
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
//--- http://dominio.com/api/test-forzar-mora
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

// --- 10. DASHBOARD STATS (ESTADÍSTICAS MEJORADAS) ---
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        // 1. Total Clientes Activos
        const resTotal = await pool.query("SELECT COUNT(*) FROM usuarios WHERE estado_servicio != 'INACTIVO'");
        const totalClientes = parseInt(resTotal.rows[0].count);
  
        // 2. Clientes en Mora (Tienen al menos una factura vencida pendiente)
        const resMora = await pool.query(`
            SELECT COUNT(DISTINCT usuario_id) 
            FROM facturas 
            WHERE estado = 'pendiente' AND CURRENT_DATE > DATE(fecha_vencimiento)
        `);
        const clientesMora = parseInt(resMora.rows[0].count);
  
        // 3. Clientes Sin Datos (Nunca se les ha generado factura)
        // Buscamos usuarios activos que NO estén en la tabla de facturas
        const resSinDatos = await pool.query(`
            SELECT COUNT(*) FROM usuarios u
            WHERE u.estado_servicio != 'INACTIVO'
            AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.usuario_id = u.id)
        `);
        const clientesSinDatos = parseInt(resSinDatos.rows[0].count);
  
        // 4. Clientes Al Día (Resto)
        const clientesAlDia = totalClientes - clientesMora - clientesSinDatos;
  
        // 5. Finanzas (Igual que antes)
        const hoy = new Date();
        const mesActual = hoy.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' });
        const mesServicio = mesActual.charAt(0).toUpperCase() + mesActual.slice(1);
  
        const resRecaudado = await pool.query(`SELECT SUM(monto) FROM facturas WHERE estado = 'pagado' AND mes_servicio = $1`, [mesServicio]);
        const resPendiente = await pool.query(`SELECT SUM(monto) FROM facturas WHERE estado = 'pendiente'`);
  
        res.json({
            totalClientes,
            clientesMora,
            clientesAlDia,
            clientesSinDatos, // <--- NUEVO CAMPO
            recaudado: resRecaudado.rows[0].sum || 0,
            pendiente: resPendiente.rows[0].sum || 0,
            mesActual: mesServicio
        });
  
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error calculando estadísticas' });
    }
  });

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});