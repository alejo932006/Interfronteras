require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'interfronterasbd',
  password: process.env.DB_PASSWORD || '0534',
  port: 5432,
});

async function diagnosticar() {
    try {
        console.log("🔍 DIAGNÓSTICO DE LA BASE DE DATOS");
        
        // 1. Total Clientes
        const total = await pool.query("SELECT COUNT(*) FROM usuarios");
        console.log(`👥 Total Clientes en BD: ${total.rows[0].count}`);

        // 2. Clientes con Precio ($) cargado
        const conPrecio = await pool.query("SELECT COUNT(*) FROM usuarios WHERE valor_mensual > 0");
        console.log(`💰 Clientes con tarifa definida: ${conPrecio.rows[0].count}`);

        // 3. Revisar los ESTADOS (Aquí suele estar el error)
        console.log("\n--- ESTADOS ENCONTRADOS ---");
        const estados = await pool.query(`
            SELECT estado_servicio, COUNT(*) as cantidad 
            FROM usuarios 
            GROUP BY estado_servicio
        `);
        console.table(estados.rows);

        console.log("\n💡 PISTA: Si ves 'ACTIVO ' (con espacio) o 'Activo', el script anterior fallaba por eso.");

    } catch (e) { console.error(e); } finally { pool.end(); }
}

diagnosticar();