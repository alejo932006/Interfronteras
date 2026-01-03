require('dotenv').config();
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

// CONFIGURACIÓN
const NOMBRE_ARCHIVO = 'BASE.xlsx'; 

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'interfronterasbd',
  password: process.env.DB_PASSWORD || '0534',
  port: 5432,
});

async function migrarDatos() {
    try {
        console.log(`📂 Leyendo archivo completo: ${NOMBRE_ARCHIVO}...`);
        const rutaArchivo = path.join(__dirname, NOMBRE_ARCHIVO);
        
        // Leemos el archivo completo
        const workbook = xlsx.readFile(rutaArchivo);
        
        for (const nombreHoja of workbook.SheetNames) {
            console.log(`\n--- Procesando hoja: ${nombreHoja} ---`);
            
            // Convertimos a JSON (raw: false ayuda a leer fechas/textos mejor a veces, pero default es ok)
            const datos = xlsx.utils.sheet_to_json(workbook.Sheets[nombreHoja]);

            if (datos.length === 0) {
                console.log("   (Hoja vacía, saltando...)");
                continue;
            }

            let usuariosProcesados = 0;

            for (const fila of datos) {
                // ============================================================
                // 1. MAPEO INTELIGENTE DE COLUMNAS (Variaciones de nombres)
                // ============================================================
                
                // Identidad
                const nombre = fila['NOMBRE'] || fila['Nombre'] || fila['nombre'];
                const documento = fila['CEDULA'] || fila['CEDULA '] || fila['Cedula'] || fila['cedula'];
                
                // Contacto
                const celular = fila['CELULAR'] || fila['Celular'] || '';
                const email = fila['CORREO ELECTRONICO'] || fila['CORREO'] || fila['Correo'] || '';

                // Ubicación (A veces es Barrio, Vereda, Dirección o Finca)
                // Concatenamos Dirección + Finca si ambas existen para tener dato completo
                const dir1 = fila['DIRECCION'] || fila['FINCA O DIRECCION'] || fila['FINCA'] || '';
                const dir2 = fila['BARRIO'] || fila['VEREDA'] || fila['VEREDA  O  BARRIO'] || '';
                
                // Técnica
                const pppoe = fila['PPPOE'] || fila['PPOE'] || fila['pppoe'] || fila['Ppoe'] || null;
                const amarra = fila['AMARRA'] || fila['Amarra'] || '';
                const nodo = fila['NODO'] || fila['Nodo'] || fila['SERVIDOR'] || ''; // A veces SERVIDOR actúa como Nodo
                const plan = fila['PLAN DE SERVICIO'] || fila['PLAN'] || '';

                // Estado
                const estadoUser = fila['ESTADO USUARIO'] || fila['ESTADO'] || 'ACTIVO';

                // Financiero
                let deuda = fila['VALOR A PAGAR'] || fila['VALOR PLAN'] || fila['SALDO'] || 0;

                // ============================================================
                // 2. VALIDACIÓN Y LIMPIEZA
                // ============================================================
                if (!documento || !nombre) continue; // Datos mínimos obligatorios

                const docLimpio = documento.toString().trim();
                const pppoeLimpio = pppoe ? pppoe.toString().trim() : null;
                
                // Limpiar deuda (quitar signos $ o comas)
                if (typeof deuda === 'string') {
                    deuda = parseFloat(deuda.replace(/[^0-9.]/g, '')) || 0;
                }

                // ============================================================
                // 3. UPSERT (Insertar o Actualizar Usuario)
                // ============================================================
                
                // Primero buscamos si existe
                const resUser = await pool.query("SELECT id FROM usuarios WHERE documento_id = $1", [docLimpio]);
                let usuarioId;

                if (resUser.rows.length > 0) {
                    usuarioId = resUser.rows[0].id;
                    // ACTUALIZAMOS todos los campos nuevos
                    await pool.query(
                        `UPDATE usuarios SET 
                            nombre_completo = $1, 
                            celular = $2,
                            email = $3,
                            direccion = $4,
                            barrio = $5,
                            codigo_pppoe = $6,
                            amarra = $7,
                            nodo = $8,
                            plan_internet = $9,
                            estado_servicio = $10
                        WHERE id = $11`,
                        [nombre, celular, email, dir1, dir2, pppoeLimpio, amarra, nodo, plan, estadoUser, usuarioId]
                    );
                } else {
                    // CREAMOS usuario nuevo con todo
                    const insertUser = await pool.query(
                        `INSERT INTO usuarios 
                        (nombre_completo, documento_id, celular, email, direccion, barrio, codigo_pppoe, amarra, nodo, plan_internet, estado_servicio) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
                        RETURNING id`,
                        [nombre, docLimpio, celular, email, dir1, dir2, pppoeLimpio, amarra, nodo, plan, estadoUser]
                    );
                    usuarioId = insertUser.rows[0].id;
                }

                usuariosProcesados++;

                // ============================================================
                // 4. GENERAR FACTURA (Solo si debe y no es "NO PAGA")
                // ============================================================
                // Algunos registros dicen "NO PAGA" en valor, eso retorna 0 en la limpieza, así que se ignora.
                
                if (deuda > 0 && estadoUser.toUpperCase().includes('ACTIVO')) {
                    const mes = 'Enero 2026';
                    
                    // Verificar duplicado
                    const resFactura = await pool.query(
                        "SELECT id FROM facturas WHERE usuario_id = $1 AND mes_servicio = $2",
                        [usuarioId, mes]
                    );

                    if (resFactura.rows.length === 0) {
                        await pool.query(
                            `INSERT INTO facturas 
                            (usuario_id, monto, mes_servicio, estado, fecha_vencimiento) 
                            VALUES ($1, $2, $3, 'pendiente', NOW() + INTERVAL '15 days')`,
                            [usuarioId, deuda, mes]
                        );
                    }
                }
            }
            console.log(`   ✅ Procesados ${usuariosProcesados} usuarios en esta hoja.`);
        }

        console.log("\n🏁 ¡Migración Maestra Finalizada!");

    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        pool.end();
    }
}

migrarDatos();