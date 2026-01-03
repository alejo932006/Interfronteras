require('dotenv').config();
const { Pool } = require('pg');

// --- CONFIGURACIÓN ---
const MES_A_FACTURAR = 'Febrero 2026'; 
const DIA_VENCIMIENTO = 15; 
// ---------------------

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'interfronterasbd',
  password: process.env.DB_PASSWORD || '0534',
  port: 5432,
});

async function generarFacturasMasivas() {
    try {
        console.log(`🚀 Iniciando facturación masiva para: ${MES_A_FACTURAR}`);

        // ==================================================================
        // 1. CONSULTA MEJORADA (Flexible con espacios y mayúsculas)
        // ==================================================================
        const queryUsuarios = `
            SELECT id, nombre_completo, valor_mensual, estado_servicio
            FROM usuarios 
            WHERE TRIM(UPPER(estado_servicio)) = 'ACTIVO'
        `;

        const resultado = await pool.query(queryUsuarios);
        const todosLosActivos = resultado.rows;

        console.log(`📋 Se encontraron ${todosLosActivos.length} usuarios marcados como ACTIVO.`);

        let facturasCreadas = 0;
        let facturasOmitidas = 0;
        let sinPrecio = 0;

        // 2. Recorrer y validar uno por uno
        for (const usuario of todosLosActivos) {
            
            // FILTRO 1: ¿Tiene precio definido?
            // Convertimos a número por si acaso viene como string
            const tarifa = parseFloat(usuario.valor_mensual);

            if (!tarifa || tarifa <= 0) {
                // console.log(`⚠️ Saltando a ${usuario.nombre_completo}: No tiene valor mensual definido.`);
                sinPrecio++;
                continue;
            }

            // FILTRO 2: ¿Ya tiene factura este mes?
            const check = await pool.query(
                "SELECT id FROM facturas WHERE usuario_id = $1 AND mes_servicio = $2",
                [usuario.id, MES_A_FACTURAR]
            );

            if (check.rows.length > 0) {
                facturasOmitidas++;
                continue;
            }

            // CREAR FACTURA
            await pool.query(`
                INSERT INTO facturas 
                (usuario_id, monto, mes_servicio, estado, fecha_vencimiento)
                VALUES ($1, $2, $3, 'pendiente', NOW() + INTERVAL '${DIA_VENCIMIENTO} days')
            `, [usuario.id, tarifa, MES_A_FACTURAR]);

            facturasCreadas++;
        }

        console.log("\n📊 RESUMEN FINAL:");
        console.log(`--------------------------`);
        console.log(`✅ Facturas Creadas:      ${facturasCreadas}`);
        console.log(`⏭️  Ya existían (Omitidas): ${facturasOmitidas}`);
        console.log(`⚠️  Sin Precio (Saltadas):  ${sinPrecio}`);
        
        if (sinPrecio > 0) {
            console.log(`\n🚨 ATENCIÓN: Hay ${sinPrecio} usuarios activos sin precio.`);
            console.log("   Debes correr de nuevo el script 'guardar_precios.js' mejorado.");
        }

    } catch (error) {
        console.error("❌ Error generando facturas:", error);
    } finally {
        pool.end();
    }
}

generarFacturasMasivas();