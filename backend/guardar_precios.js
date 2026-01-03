require('dotenv').config();
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

const NOMBRE_ARCHIVO = 'BASE.xlsx'; 

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'interfronterasbd',
  password: process.env.DB_PASSWORD || '0534',
  port: 5432,
});

async function trasladarValorAPagar() {
    try {
        console.log("🛠️  1. Asegurando columna 'valor_mensual' en la BD...");
        await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS valor_mensual DECIMAL(10, 2) DEFAULT 0;");
        
        console.log(`📂 2. Analizando archivo: ${NOMBRE_ARCHIVO}...`);
        const workbook = xlsx.readFile(path.join(__dirname, NOMBRE_ARCHIVO));
        
        let totalActualizados = 0;

        for (const nombreHoja of workbook.SheetNames) {
            console.log(`\n📄 Procesando hoja: ${nombreHoja}`);
            
            // Leemos la hoja como una MATRIZ (Filas y Columnas sin procesar)
            // Esto nos permite buscar dónde empieza realmente la tabla
            const filas = xlsx.utils.sheet_to_json(workbook.Sheets[nombreHoja], { header: 1 });

            if (filas.length === 0) continue;

            // 1. BUSCAR LA FILA DE ENCABEZADOS
            let indiceEncabezado = -1;
            let colCedula = -1;
            let colValor = -1;

            for (let i = 0; i < filas.length; i++) {
                const fila = filas[i];
                // Buscamos una fila que tenga la palabra "CEDULA" (ignorando mayúsculas/minúsculas)
                const celdaCedula = fila.findIndex(celda => 
                    celda && celda.toString().toUpperCase().includes('CEDULA')
                );

                if (celdaCedula !== -1) {
                    indiceEncabezado = i;
                    colCedula = celdaCedula;
                    
                    // Una vez hallada la fila de títulos, buscamos en qué columna está el precio
                    // Prioridad: VALOR A PAGAR > VALOR PLAN > SALDO > VALOR
                    colValor = fila.findIndex(c => c && c.toString().toUpperCase().includes('VALOR A PAGAR'));
                    if (colValor === -1) colValor = fila.findIndex(c => c && c.toString().toUpperCase().includes('VALOR PLAN'));
                    if (colValor === -1) colValor = fila.findIndex(c => c && c.toString().toUpperCase().includes('SALDO'));
                    
                    console.log(`   ✅ Tabla encontrada en fila ${i + 1}.`);
                    break; // Dejamos de buscar
                }
            }

            if (indiceEncabezado === -1 || colValor === -1) {
                console.log("   ⚠️ No se encontró la estructura de tabla en esta hoja. Saltando...");
                continue;
            }

            // 2. LEER LOS DATOS DESDE LA FILA SIGUIENTE
            let contHoja = 0;
            for (let j = indiceEncabezado + 1; j < filas.length; j++) {
                const fila = filas[j];
                
                // Extraer datos usando los índices encontrados
                const documentoRaw = fila[colCedula];
                let precioRaw = fila[colValor];

                if (!documentoRaw) continue; // Si no hay cédula, ignorar

                // Limpieza de Cédula
                const documento = documentoRaw.toString().trim();

                // Limpieza de Precio
                let precio = 0;
                if (precioRaw) {
                    // Convertir "$ 42.000" -> 42000
                    const precioString = precioRaw.toString().replace(/[^0-9.]/g, '');
                    precio = parseFloat(precioString) || 0;
                }

                if (precio > 0) {
                    const res = await pool.query(
                        "UPDATE usuarios SET valor_mensual = $1 WHERE documento_id = $2",
                        [precio, documento]
                    );
                    if (res.rowCount > 0) {
                        totalActualizados++;
                        contHoja++;
                    }
                }
            }
            console.log(`   --> ${contHoja} precios actualizados en esta hoja.`);
        }

        console.log(`\n🎉 RESULTADO FINAL:`);
        console.log(`   Se actualizaron las tarifas de ${totalActualizados} clientes.`);
        console.log("   (Debería estar muy cerca de tu total de 1000).");

    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        pool.end();
    }
}

trasladarValorAPagar();