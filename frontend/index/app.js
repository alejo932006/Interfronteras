const API_URL = ""; 
const CLOUDFLARE_URL = "https://webcast-made-row-time.trycloudflare.com"; 

// --- CONFIGURACIÓN CON TUS LLAVES NUEVAS ---
const handler = ePayco.checkout.configure({
    key: '01816176c01e90993e14a2357b7ed01b', // TU PUBLIC_KEY
    test: true // Modo pruebas activado
});

// --- LÓGICA DE RESPUESTA ---
window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const refPayco = urlParams.get('ref_payco');

    if (refPayco) {
        window.history.replaceState({}, document.title, "/");
        fetch(`https://secure.epayco.co/validation/v1/reference/${refPayco}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const x = data.data.x_cod_response;
                    if (x == 1) alert("✅ ¡Pago Exitoso! (Prueba)");
                    else if (x == 2 || x == 4) alert("❌ Pago Rechazado");
                    else if (x == 3) alert("⏳ Pago Pendiente");
                }
            })
            .catch(e => console.error("Error validando:", e));
    }
};

// --- VISUAL ---
function abrirModal(e) { if(e) e.preventDefault(); document.getElementById('modalPago').classList.add('active'); }
function cerrarModal() { document.getElementById('modalPago').classList.remove('active'); }
document.getElementById('modalPago').addEventListener('click', (e) => { if (e.target === document.getElementById('modalPago')) cerrarModal(); });

async function buscarFactura() {
    const documento = document.getElementById('documentoInput').value;
    const resultadoDiv = document.getElementById('resultadoFacturas');
    
    if(!documento) return;
    resultadoDiv.innerHTML = '<p>Buscando...</p>';

    try {
        const response = await fetch(`/api/facturas/${documento}`);
        if (!response.ok) { resultadoDiv.innerHTML = '<div style="color:red">No hay facturas.</div>'; return; }
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
                </div>`;
        });
    } catch (e) { resultadoDiv.innerHTML = '<p>Error de conexión.</p>'; }
}

// --- FUNCIÓN DE PAGO ---
function iniciarPagoEpayco(idFactura, monto, descripcion) {
    let montoLimpio = Math.round(parseFloat(monto));

    if(isNaN(montoLimpio) || montoLimpio < 500) { alert("Monto inválido"); return; }

    const data = {
        name: "Interfronteras - PRUEBA",
        description: "Pago Factura #" + idFactura,
        invoice: idFactura + "-" + Date.now(),
        extra1: idFactura,
        confirmation: `${CLOUDFLARE_URL}/api/confirmacion`,
        currency: "cop",
        amount: montoLimpio,
        tax_base: montoLimpio,
        tax: "0",
        country: "co",
        lang: "es",
        external: true, // Redirección segura

        // URLS (Cloudflare)
        confirmation: `${CLOUDFLARE_URL}/api/confirmacion`, 
        response: `${CLOUDFLARE_URL}/index.html`,

        // DATOS DEL CLIENTE (Obligatorios)
        email: "tu_correo_personal@gmail.com", // Pon tu correo real aquí para recibir el comprobante
        name_billing: "Alejandro Test",
        address_billing: "Calle Prueba 123",
        type_doc_billing: "cc",
        number_doc_billing: "1094936622", // Tu cédula o una de prueba
        mobilephone_billing: "3001234567"
    };

    handler.open(data);
}

// Otros
window.addEventListener('scroll', () => { document.querySelector('.navbar').classList.toggle('scrolled', window.scrollY > 50); });
function toggleMenu() { document.getElementById('navLinks').classList.toggle('active'); }
function abrirTerminos(e) { if(e) e.preventDefault(); document.getElementById('modalTerminos').classList.add('active'); }
function cerrarTerminos() { document.getElementById('modalTerminos').classList.remove('active'); }
document.getElementById('modalTerminos').addEventListener('click', (e) => { if (e.target === document.getElementById('modalTerminos')) cerrarTerminos(); });