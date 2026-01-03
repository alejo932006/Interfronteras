const API_URL = ""; 

// --- LÓGICA DEL MODAL ---

const handler = ePayco.checkout.configure({
    key: 'b459d654998c6fea2f9c6b9e1cacb960', // TU PUBLIC_KEY
    test: true // true para pruebas, false para producción
  });

function abrirModal(e) {
    if(e) e.preventDefault(); // Evita que la página salte hacia arriba
    const modal = document.getElementById('modalPago');
    modal.classList.add('active'); // Activa la animación CSS
    document.getElementById('documentoInput').focus(); // Pone el cursor listo para escribir
}

function cerrarModal() {
    const modal = document.getElementById('modalPago');
    modal.classList.remove('active');
    
    // Limpiar resultados al cerrar para que se vea limpio la próxima vez
    setTimeout(() => {
        document.getElementById('resultadoFacturas').innerHTML = '';
        document.getElementById('documentoInput').value = '';
    }, 300); // Espera a que termine la animación de cierre
}

// Cerrar modal si hacen clic afuera de la caja blanca
document.getElementById('modalPago').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalPago')) {
        cerrarModal();
    }
});

// --- LÓGICA DE PAGOS (Igual que antes) ---

async function buscarFactura() {
    const documento = document.getElementById('documentoInput').value;
    const resultadoDiv = document.getElementById('resultadoFacturas');
    
    if(!documento) return;

    resultadoDiv.innerHTML = '<p style="color:#666"><i class="fa-solid fa-spinner fa-spin"></i> Buscando...</p>';

    try {
        const response = await fetch(`${API_URL}/api/facturas/${documento}`);
        
        if (!response.ok) {
            resultadoDiv.innerHTML = `
                <div style="padding:15px; background:#ffebeb; border-radius:8px; color:#d32f2f;">
                    <i class="fa-solid fa-circle-exclamation"></i> No tienes facturas pendientes.
                </div>`;
            return;
        }

        const facturas = await response.json();
        
        resultadoDiv.innerHTML = '';
        facturas.forEach(f => {
            // Pasamos los datos directamente a la función pagar
            resultadoDiv.innerHTML += `
                <div class="factura-card">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0; font-size:1.1rem;">${f.mes_servicio}</h3>
                        <span style="background:#e3f2fd; color:#0d47a1; padding:3px 8px; border-radius:10px; font-size:0.8rem;">Internet</span>
                    </div>
                    <p style="margin:5px 0; color:#555;">${f.nombre_completo}</p>
                    <h2 style="margin:10px 0; color:var(--color-secondary);">$${parseInt(f.monto).toLocaleString()}</h2>
                    <p style="font-size:0.8rem; color:#888;">Vence: ${f.fecha_vencimiento.split('T')[0]}</p>
                    
                    <button onclick="iniciarPagoEpayco('${f.id}', '${f.monto}', '${f.mes_servicio}')" class="btn-pagar" style="width:100%; margin-top:10px; cursor:pointer;">
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

// NUEVA FUNCIÓN DE PAGO CON EPAYCO
function iniciarPagoEpayco(idFactura, monto, descripcion) {
    const data = {
        name: "Servicio Internet - " + descripcion,
        description: "Pago factura #" + idFactura,
        invoice: idFactura + "-" + Date.now(), 
        currency: "cop",
        amount: parseInt(monto), 
        tax_base: "0",
        tax: "0",
        country: "co",
        lang: "es",
        external: "true", // Redirección obligatoria para túneles
        
        name_billing: "Cliente Pruebas",
        address_billing: "Calle 123",
        type_doc_billing: "cc",
        mobilephone_billing: "3000000000",
        number_doc_billing: "123456789",

        confirmation: `${window.location.origin}/api/confirmacion`, 
        response: `${window.location.origin}/index.html`,
        methodsDisable: []
    };

    handler.open(data);
}


window.addEventListener('scroll', function() {
    const navbar = document.querySelector('.navbar');
    // Si bajamos más de 50px, agregamos la clase "scrolled"
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

function toggleMenu() {
    const navLinks = document.getElementById('navLinks');
    navLinks.classList.toggle('active');
}

// --- MODAL TÉRMINOS Y CONDICIONES ---

function abrirTerminos(e) {
    if(e) e.preventDefault();
    const modal = document.getElementById('modalTerminos');
    modal.classList.add('active');
}

function cerrarTerminos() {
    const modal = document.getElementById('modalTerminos');
    modal.classList.remove('active');
}

// Cerrar si hacen clic afuera
document.getElementById('modalTerminos').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalTerminos')) {
        cerrarTerminos();
    }
});