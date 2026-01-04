const API_URL = ""; 
// Tu URL del túnel (verifícala siempre, si se cierra cloudflare cambia)
const CLOUDFLARE_URL = "https://was-spyware-ending-electoral.trycloudflare.com"; 

// --- LÓGICA DE VALIDACIÓN (Al volver del pago) ---
window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const refPayco = urlParams.get('ref_payco');

    if (refPayco) {
        // Limpiamos la URL
        window.history.replaceState({}, document.title, "/");
        
        // Consultamos el estado
        fetch(`https://secure.epayco.co/validation/v1/reference/${refPayco}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const estado = data.data.x_cod_response;
                    if (estado == 1) alert("✅ ¡Pago Exitoso! Gracias.");
                    else if (estado == 2 || estado == 4) alert("❌ El pago fue rechazado.");
                    else if (estado == 3) alert("⏳ Pago pendiente.");
                }
            })
            .catch(e => console.error("Error validando:", e));
    }
};

// --- FUNCIONES VISUALES (Modal y Búsqueda) ---
function abrirModal(e) {
    if(e) e.preventDefault();
    document.getElementById('modalPago').classList.add('active');
    document.getElementById('documentoInput').focus();
}

function cerrarModal() {
    document.getElementById('modalPago').classList.remove('active');
    setTimeout(() => {
        document.getElementById('resultadoFacturas').innerHTML = '';
        document.getElementById('documentoInput').value = '';
    }, 300);
}

document.getElementById('modalPago').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalPago')) cerrarModal();
});

async function buscarFactura() {
    const documento = document.getElementById('documentoInput').value;
    const resultadoDiv = document.getElementById('resultadoFacturas');
    
    if(!documento) return;
    resultadoDiv.innerHTML = '<p style="color:#666">Buscando...</p>';

    try {
        const response = await fetch(`/api/facturas/${documento}`);
        if (!response.ok) {
            resultadoDiv.innerHTML = `<div style="padding:15px; color:#d32f2f;">No tienes facturas pendientes.</div>`;
            return;
        }

        const facturas = await response.json();
        resultadoDiv.innerHTML = '';
        facturas.forEach(f => {
            resultadoDiv.innerHTML += `
                <div class="factura-card">
                    <h3>${f.mes_servicio}</h3>
                    <p>${f.nombre_completo}</p>
                    <h2>$${parseInt(f.monto).toLocaleString()}</h2>
                    <button onclick="iniciarPagoEpayco('${f.id}', '${f.monto}', '${f.mes_servicio}')" class="btn-pagar" style="width:100%; margin-top:10px;">
                        Pagar con ePayco
                    </button>
                </div>
            `;
        });
    } catch (error) {
        console.error(error);
        resultadoDiv.innerHTML = '<p>Error de conexión.</p>';
    }
}

// --- FUNCIÓN DE PAGO INFALIBLE (Formulario Invisible) ---
function iniciarPagoEpayco(idFactura, monto, descripcion) {
    // 1. Limpieza matemática
    let montoNumber = parseFloat(monto);
    let montoLimpio = Math.round(montoNumber);

    if(isNaN(montoLimpio) || montoLimpio < 500) {
        alert("El monto no es válido.");
        return;
    }

    console.log("Enviando a ePayco...", montoLimpio);

    // 2. Parámetros del Checkout Estándar
    const params = {
        p_cust_id_cliente: '504560',
        
        // --- CORRECCIÓN IMPORTANTE AQUÍ ---
        // Para el formulario HTML se debe usar la PUBLIC_KEY (b459...)
        p_key: 'b459d654998c6fea2f9c6b9e1cacb960', 
        // ----------------------------------
        
        p_id_invoice: idFactura + "-" + Date.now(),
        p_description: "Interfronteras - " + descripcion,
        p_currency_code: 'COP',
        p_amount: montoLimpio,
        p_tax: 0,
        p_amount_base: montoLimpio, // Base = Total (Impuesto 0)
        
        // Si sigue fallando, prueba cambiar esto a 'TRUE'
        p_test_request: 'FALSE', 
        
        p_url_response: `${CLOUDFLARE_URL}/index.html`,
        p_url_confirmation: `${CLOUDFLARE_URL}/api/confirmacion`,
        p_email: 'cliente_prueba@gmail.com',
        p_billing_name: 'Cliente Pruebas',
        p_billing_document: '123456789'
    };

    // 3. Crear formulario y enviarlo
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://secure.checkout.epayco.co/checkout.php';
    form.style.display = 'none';

    for (const key in params) {
        if (params.hasOwnProperty(key)) {
            const hiddenField = document.createElement('input');
            hiddenField.type = 'hidden';
            hiddenField.name = key;
            hiddenField.value = params[key];
            form.appendChild(hiddenField);
        }
    }

    document.body.appendChild(form);
    form.submit();
}

// --- VISUAL (Navbar y Scroll) ---
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    window.scrollY > 50 ? navbar.classList.add('scrolled') : navbar.classList.remove('scrolled');
});
function toggleMenu() { document.getElementById('navLinks').classList.toggle('active'); }
function abrirTerminos(e) { if(e) e.preventDefault(); document.getElementById('modalTerminos').classList.add('active'); }
function cerrarTerminos() { document.getElementById('modalTerminos').classList.remove('active'); }
document.getElementById('modalTerminos').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalTerminos')) cerrarTerminos();
});