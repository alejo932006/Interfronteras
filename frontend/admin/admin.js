const API = '/api';
let currentClientFilter = 'todos';
let currentPage = 1;
let currentSearch = '';
let listaClientesCache = []; // Para llenar el form sin llamar a la API de nuevo

// --- AUTH ---
if(localStorage.getItem('adminToken')) {
    document.getElementById('login-overlay').classList.add('hidden');
    cargarDashboard();
    cargarClientes();
}

async function login() {
    const u = document.getElementById('loginUser').value;
    const p = document.getElementById('loginPass').value;
    const res = await fetch(`${API}/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usuario:u, password:p}) });
    const d = await res.json();
    if(d.success) { localStorage.setItem('adminToken', d.token); location.reload(); }
    else alert(d.message);
}
function logout() { localStorage.removeItem('adminToken'); location.reload(); }

// --- CLIENTES (CARGAR) ---
async function cargarClientes(page = 1) {
    currentPage = page;
    const tbody = document.getElementById('tabla-clientes-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Cargando...</td></tr>';

    const url = `${API}/clientes?page=${page}&limit=50&search=${encodeURIComponent(currentSearch)}&estado=${currentClientFilter}`;
        
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        listaClientesCache = data.data; // Guardamos para usar al editar
        document.getElementById('stat-total').innerText = data.pagination.total;
        document.getElementById('page-info').innerText = `Página ${data.pagination.page} de ${data.pagination.totalPages}`;

        tbody.innerHTML = '';
        if(listaClientesCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No se encontraron resultados.</td></tr>';
            return;
        }

        listaClientesCache.forEach((c, index) => {
            // Estado visual
            let badge = '<span class="badge" style="background:#eee; color:#666">Sin datos</span>';

            if(c.ultimo_mes) {
                const pagado = c.ultimo_estado && c.ultimo_estado.toLowerCase() === 'pagado';
                
                // Lógica para definir el color y texto
                let colorFondo = pagado ? '#d5f5e3' : '#fadbd8'; // Verde o Rojo suave
                let colorTexto = pagado ? '#196f3d' : '#943126'; // Verde o Rojo fuerte
                let textoEstado = c.ultimo_estado;
                let claseAnimacion = '';
            
                // Si está pendiente y tiene mora, cambiamos a ALERTA ROJA
                // (Asegúrate de que c.dias_mora venga del backend como número)
                if (!pagado && c.dias_mora > 0) {
                    textoEstado = `EN MORA (+${c.dias_mora})`;
                    colorFondo = '#fadbd8'; // Rojo claro
                    colorTexto = '#c0392b'; // Rojo intenso
                    claseAnimacion = 'badge-mora';
                    // Opcional: Si creaste la clase CSS, úsala aquí: class="badge badge-mora"
                } else if (!pagado) {
                    // Pendiente normal (sin mora)
                    colorFondo = '#fef9e7'; // Amarillo
                    colorTexto = '#b7950b';
                }
            
                badge = `<span class="badge ${pagado ? 'bg-pagado':'bg-pendiente'} ${claseAnimacion}" style="background:${colorFondo}; color:${colorTexto}">${textoEstado}</span><br><small>${c.ultimo_mes}</small>`;            }

            tbody.innerHTML += `
            <tr>
                <td><input type="checkbox" class="client-check" value="${c.id}" onchange="actualizarContador()"></td>
                <td><span style="color:#888; font-weight:bold;">${c.id}</span></td>
                <td><b>${c.documento_id}</b></td>
                <td>${c.nombre_completo}<br><small>📱 ${c.celular||'--'}</small></td>
                <td>${c.barrio||''}<br><small>${c.direccion||''}</small></td>
                <td>${c.plan_internet}<br><small style="color:blue">${c.codigo_pppoe||''}</small></td>
                <td>${badge}</td>
                <td>
                    <button class="btn btn-green" style="padding:4px 8px" onclick="abrirModalDetalle(${c.id})" title="Ver Detalles y Pago"><i class="fas fa-eye"></i></button>
                    
                    <button class="btn btn-blue" style="padding:4px 8px" onclick="cargarDatosEdicion(${index})" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-red" style="padding:4px 8px" onclick="eliminar(${c.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
        });

    } catch(e) { console.error(e); alert("Error cargando datos"); }
}

// --- BÚSQUEDA ---
function buscar() {
    currentSearch = document.getElementById('searchInput').value.trim();
    cargarClientes(1); // Reset a página 1
}
function limpiarBusqueda() {
    document.getElementById('searchInput').value = '';
    buscar();
}
function detectarEnter(e) { if(e.key === 'Enter') buscar(); }
function cambiarPagina(dir) {
    if(currentPage + dir > 0) cargarClientes(currentPage + dir);
}

// --- FORMULARIO (CREAR / EDITAR) ---
function abrirFormulario() {
    // CAMBIO: Ahora usamos display 'flex' sobre el modal-formulario
    const modal = document.getElementById('modal-formulario');
    modal.style.display = 'flex';
    
    document.getElementById('form-title').innerText = "Registrar Nuevo Cliente";
    document.getElementById('editId').value = ""; // Limpiar ID (modo crear)
    
    // Limpiar inputs (Seleccionamos inputs dentro del modal)
    document.querySelectorAll('#modal-formulario input').forEach(i => i.value = '');
    
    // Restaurar selects por defecto
    document.getElementById('plan').value = '150 MEGAS';
}

function cerrarFormulario() {
    // CAMBIO: Ocultamos el modal
    document.getElementById('modal-formulario').style.display = 'none';
}

function formatearFechaInput(fechaISO) {
    if (!fechaISO) return '';
    // Tomamos solo la parte de la fecha (los primeros 10 caracteres)
    return new Date(fechaISO).toISOString().split('T')[0];
}

function cargarDatosEdicion(index) {
    const c = listaClientesCache[index];
    if(!c) return;

    // CAMBIO: Abrimos el modal y cambiamos el título
    const modal = document.getElementById('modal-formulario');
    modal.style.display = 'flex';
    document.getElementById('form-title').innerText = "Editar Cliente: " + c.nombre_completo;
    
    document.getElementById('editId').value = c.id; // Modo edición

    // Llenar campos (Igual que antes)
    document.getElementById('doc').value = c.documento_id;
    document.getElementById('nombre').value = c.nombre_completo;
    document.getElementById('celular').value = c.celular || '';
    document.getElementById('email').value = c.email || '';
    document.getElementById('direccion').value = c.direccion || '';
    document.getElementById('barrio').value = c.barrio || '';
    document.getElementById('plan').value = c.plan_internet || '150 MEGAS';
    document.getElementById('valor').value = c.valor_mensual || '';
    document.getElementById('pppoe').value = c.codigo_pppoe || '';
    document.getElementById('nodo').value = c.nodo || '';
    document.getElementById('amarra').value = c.amarra || '';
    document.getElementById('fecha_registro').value = formatearFechaInput(c.fecha_registro);
    document.getElementById('fecha_corte').value = formatearFechaInput(c.fecha_corte);
}

async function guardarCliente() {
    const id = document.getElementById('editId').value;
    const data = {
        documento_id: document.getElementById('doc').value,
        nombre_completo: document.getElementById('nombre').value,
        celular: document.getElementById('celular').value,
        email: document.getElementById('email').value,
        direccion: document.getElementById('direccion').value,
        barrio: document.getElementById('barrio').value,
        plan_internet: document.getElementById('plan').value,
        valor_mensual: document.getElementById('valor').value,
        codigo_pppoe: document.getElementById('pppoe').value,
        nodo: document.getElementById('nodo').value,
        amarra: document.getElementById('amarra').value,
        fecha_registro: document.getElementById('fecha_registro').value || null,
        fecha_corte: document.getElementById('fecha_corte').value || null
    };

    if(!data.documento_id || !data.nombre_completo) return alert("Falta documento o nombre");

    let url = `${API}/clientes`;
    let method = 'POST';

    // Si hay ID, es una edición (PUT)
    if(id) {
        url += `/${id}`;
        method = 'PUT';
    }

    const res = await fetch(url, {
        method: method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    const r = await res.json();
    
    if(r.success) {
        alert(id ? "Actualizado correctamente" : "Cliente creado correctamente");
        cerrarFormulario();
        cargarClientes(currentPage); // Recargar tabla
    } else {
        alert("Error: " + r.error);
    }
}

async function eliminar(id) {
    if(confirm("¿Seguro que deseas eliminar? Se borrarán las facturas asociadas.")) {
        await fetch(`${API}/clientes/${id}`, {method:'DELETE'});
        cargarClientes(currentPage);
    }
}

// --- TABS ---
function showTab(id) {
    document.querySelectorAll('.tab-section').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-'+id).classList.add('active');
    
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    // Lógica simple para resaltar menú
    if(id === 'dashboard') document.querySelectorAll('.menu-item')[0].classList.add('active');
    if(id === 'clientes') {
        document.querySelectorAll('.menu-item')[1].classList.add('active');
        cargarDashboard();
        cargarClientes();
    }
    if(id === 'facturas') {
        document.querySelectorAll('.menu-item')[2].classList.add('active');
        cargarFacturas(); // Carga la lista al entrar
    }
}

// --- FUNCIONES DEL MODAL DE DETALLE ---

async function abrirModalDetalle(idCliente) {
    const modal = document.getElementById('modal-detalle');
    // Mostramos el modal primero (quitamos la clase hidden o cambiamos display)
    modal.style.display = 'flex'; 

    // Limpiamos datos previos
    document.getElementById('view-nombre').innerText = "Cargando...";
    document.getElementById('view-pago').innerText = "...";

    try {
        // Petición al endpoint que creamos en el Paso 1
        const res = await fetch(`${API}/clientes/${idCliente}`);
        const cliente = await res.json();

        if (!cliente || !cliente.nombre_completo) {
            alert("No se pudo cargar la información");
            return;
        }

        // Llenar los datos
        document.getElementById('view-nombre').innerText = cliente.nombre_completo;
        document.getElementById('view-doc').innerText = cliente.documento_id || '--';
        document.getElementById('view-celular').innerText = cliente.celular || '--';
        document.getElementById('view-direccion').innerText = cliente.direccion || '';
        document.getElementById('view-barrio').innerText = cliente.barrio || '';
        document.getElementById('view-email').innerText = cliente.email || 'No registrado';
        document.getElementById('view-plan').innerText = cliente.plan_internet || '--';
        document.getElementById('view-pppoe').innerText = cliente.codigo_pppoe || '--';
        document.getElementById('view-nodo').innerText = cliente.nodo || '--';
        document.getElementById('view-estado').innerText = cliente.estado || 'Activo';

        // Formatear el dinero
        const valor = parseFloat(cliente.valor_mensual || 0).toLocaleString('es-CO', {style: 'currency', currency: 'COP'});
        document.getElementById('view-pago').innerText = valor;

    } catch (e) {
        console.error(e);
        alert("Error al cargar los detalles.");
        cerrarModalDetalle();
    }
}

function cerrarModalDetalle() {
    document.getElementById('modal-detalle').style.display = 'none';
}

// Cerrar si hacen clic fuera de la caja blanca
window.onclick = function(event) {
    const modalDetalle = document.getElementById('modal-detalle');
    const modalForm = document.getElementById('modal-formulario');
    
    if (event.target == modalDetalle) {
        cerrarModalDetalle();
    }
    if (event.target == modalForm) {
        cerrarFormulario();
    }
}

async function generarFacturasMasivas(btnElement) {
    if(!confirm("¿Deseas buscar clientes con corte HOY y generar sus facturas?")) return;

    try {
        // Usamos el elemento que nos llegó desde el HTML
        const textoOriginal = btnElement.innerHTML;
        btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        btnElement.disabled = true;

        const res = await fetch(`${API}/facturas/generar-masivo`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            alert(data.message); 
            cargarClientes(currentPage); 
        } else {
            alert("Error: " + data.error);
        }

        // Restauramos el botón
        btnElement.innerHTML = textoOriginal;
        btnElement.disabled = false;

    } catch (e) {
        console.error(e);
        alert("Error de conexión");
        // En caso de error, asegurarnos de reactivar el botón
        if(btnElement) {
            btnElement.innerHTML = '<i class="fas fa-magic"></i> Facturar Día';
            btnElement.disabled = false;
        }
    }
}

// --- LÓGICA DEL MÓDULO FACTURAS (ACTUALIZADO CON ESTADO) ---
let currentFacturaPage = 1;

async function cargarFacturas(page = 1) {
    currentFacturaPage = page;
    const tbody = document.getElementById('tabla-facturas-body');
    
    // Leer valores de los 3 filtros
    const fechaFiltro = document.getElementById('filtroFechaFactura').value;
    const refFiltro = document.getElementById('filtroRefFactura').value.trim();
    const estadoFiltro = document.getElementById('filtroEstadoFactura').value;
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">Cargando historial...</td></tr>';

    try {
        // Construir URL con parámetros
        let url = `${API}/admin/facturas?page=${page}&limit=20`;
        if (fechaFiltro) url += `&fecha=${fechaFiltro}`;
        if (refFiltro) url += `&referencia=${encodeURIComponent(refFiltro)}`;
        if (estadoFiltro) url += `&estado=${estadoFiltro}`;

        const res = await fetch(url);
        const data = await res.json();

        tbody.innerHTML = '';
        document.getElementById('page-info-facturas').innerText = `Página ${data.pagination.page} de ${data.pagination.totalPages}`;

        if(data.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">No se encontraron facturas con esos filtros.</td></tr>';
            return;
        }

        data.data.forEach(f => {
            const monto = parseFloat(f.monto).toLocaleString('es-CO', {style:'currency', currency:'COP', minimumFractionDigits:0});
            
            let estadoColor = '#eee';
            let estadoTexto = '#333';
            let textoBadge = f.estado; // Por defecto dice "pendiente" o "pagado"
            let claseExtra = '';

            if(f.estado === 'pagado') { 
                estadoColor = '#d5f5e3'; 
                estadoTexto = '#196f3d'; 
            } 
            else if(f.estado === 'pendiente') {
                // Verificamos si tiene días de mora calculados desde el backend
                if (f.dias_mora > 0) {
                    estadoColor = '#fadbd8'; // Rojo claro de fondo
                    estadoTexto = '#c0392b'; // Rojo oscuro de texto
                    // Agregamos ícono de alerta y los días
                    textoBadge = `EN MORA (+${f.dias_mora} días)`;
                    claseExtra = 'badge-mora';
                    
                    // Opcional: Para el futuro corte con Mikrotik
                    // Si dias_mora > 5, el color podría ser más intenso
                } else {
                    estadoColor = '#fef9e7'; // Amarillo suave
                    estadoTexto = '#b7950b'; // Amarillo oscuro
                    textoBadge = 'PENDIENTE';
                }
            }

            const badge = `<span class="${claseExtra}" style="background:${estadoColor}; color:${estadoTexto}; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:11px; text-transform:uppercase; display:inline-block; min-width:80px; text-align:center;">${textoBadge}</span>`;            let fechaPagoStr = '--';
            if(f.fecha_pago) {
                fechaPagoStr = new Date(f.fecha_pago).toLocaleDateString() + ' ' + new Date(f.fecha_pago).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }

            // Resaltar referencia si se buscó
            let refTexto = f.referencia_pago || '--';
            if(refFiltro && f.referencia_pago) {
                refTexto = `<span style="background:yellow;">${f.referencia_pago}</span>`;
            }

            tbody.innerHTML += `
                <tr>
                    <td><b>${f.id}</b></td>
                    <td>${f.nombre_completo}<br><small style="color:#777;">${f.documento_id}</small></td>
                    <td>${f.mes_servicio}</td>
                    <td style="font-weight:bold;">${monto}</td>
                    <td>${badge}</td>
                    <td><small>${fechaPagoStr}</small></td>
                    <td><small style="font-family:monospace; color:#555;">${refTexto}</small></td>
                </tr>
            `;
        });

    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Error de conexión.</td></tr>';
    }
}

function limpiarFiltroFacturas() {
    document.getElementById('filtroFechaFactura').value = '';
    document.getElementById('filtroRefFactura').value = '';
    document.getElementById('filtroEstadoFactura').value = ''; // Resetear select
    cargarFacturas(1);
}

function detectarEnterFactura(e) {
    if(e.key === 'Enter') cargarFacturas(1);
}

function cambiarPaginaFacturas(dir) {
    if(currentFacturaPage + dir > 0) cargarFacturas(currentFacturaPage + dir);
}
function limpiarFiltroFacturas() {
    document.getElementById('filtroFechaFactura').value = '';
    document.getElementById('filtroRefFactura').value = '';
    cargarFacturas(1);
}

function detectarEnterFactura(e) {
    if(e.key === 'Enter') cargarFacturas(1);
}

function cambiarPaginaFacturas(dir) {
    if(currentFacturaPage + dir > 0) cargarFacturas(currentFacturaPage + dir);
}

function toggleSelectAll() {
    const masterCheck = document.getElementById('checkAll');
    const checkboxes = document.querySelectorAll('.client-check');
    
    checkboxes.forEach(cb => cb.checked = masterCheck.checked);
    actualizarContador();
}

// 2. Contar cuántos hay seleccionados y mostrar la barra
function actualizarContador() {
    const checkboxes = document.querySelectorAll('.client-check:checked');
    const count = checkboxes.length;
    const bar = document.getElementById('bulk-actions');
    
    document.getElementById('selected-count').innerText = count;
    
    if (count > 0) {
        bar.style.display = 'flex';
    } else {
        bar.style.display = 'none';
        document.getElementById('checkAll').checked = false;
    }
}

// 3. Cancelar todo
function cancelarSeleccion() {
    const checkboxes = document.querySelectorAll('.client-check');
    checkboxes.forEach(cb => cb.checked = false);
    actualizarContador();
}

// 4. ENVIAR CAMBIOS AL SERVIDOR
async function aplicarCorteMasivo() {
    const checkboxes = document.querySelectorAll('.client-check:checked');
    const fecha = document.getElementById('bulk-date').value;
    
    if (checkboxes.length === 0) return alert("Selecciona al menos un cliente.");
    if (!fecha) return alert("Selecciona una fecha de corte.");

    // Recolectar IDs
    const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));

    if(!confirm(`¿Seguro que deseas asignar la fecha de corte ${fecha} a ${ids.length} clientes?`)) return;

    try {
        const res = await fetch(`${API}/clientes/masivo/fecha-corte`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, fecha_corte: fecha })
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert(data.message);
            cancelarSeleccion();
            cargarClientes(currentPage); // Recargar tabla
        } else {
            alert("Error: " + data.error);
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión");
    }
}

async function cargarDashboard() {
    try {
        const res = await fetch(`${API}/dashboard/stats`);
        const data = await res.json();
        
        // Asignar valores
        if(document.getElementById('stat-total')) document.getElementById('stat-total').innerText = data.totalClientes;
        if(document.getElementById('stat-aldia')) document.getElementById('stat-aldia').innerText = data.clientesAlDia;
        if(document.getElementById('stat-mora')) document.getElementById('stat-mora').innerText = data.clientesMora;
        
        // NUEVO: Asignar Sin Datos
        if(document.getElementById('stat-sindatos')) document.getElementById('stat-sindatos').innerText = data.clientesSinDatos;
        
        // Formatos de dinero...
        const fmt = (val) => parseFloat(val || 0).toLocaleString('es-CO', {style:'currency', currency:'COP', maximumFractionDigits: 0});
        if(document.getElementById('stat-recaudo')) document.getElementById('stat-recaudo').innerText = fmt(data.recaudado);
        if(document.getElementById('stat-pendiente')) document.getElementById('stat-pendiente').innerText = fmt(data.pendiente);
        if(document.getElementById('stat-mes')) document.getElementById('stat-mes').innerText = data.mesActual;

    } catch(e) { console.error("Error cargando dashboard", e); }
}

function filtrarClientesDesdeDashboard(filtro) {
    // 1. Establecer el filtro
    currentClientFilter = filtro;
    
    // 2. Cambiar visualmente a la pestaña de clientes
    showTab('clientes');
    
    // 3. Actualizar el título para saber qué estamos viendo
    const titulos = {
        'todos': 'Gestión de Clientes (Todos)',
        'mora': 'Gestión de Clientes: ⚠️ EN MORA',
        'aldia': 'Gestión de Clientes: ✅ AL DÍA',
        'sindatos': 'Gestión de Clientes: 📂 SIN DATOS'
    };
    if(document.getElementById('titulo-clientes')) {
        document.getElementById('titulo-clientes').innerText = titulos[filtro] || 'Gestión de Clientes';
    }

    // 4. Cargar los datos filtrados
    cargarClientes(1);
}

setInterval(() => {
    // 1. Verificar si hay algún modal abierto (Para no interrumpir si estás editando)
    const modalDetalle = document.getElementById('modal-detalle');
    const modalFormulario = document.getElementById('modal-formulario'); // <--- CORREGIDO: ID correcto

    // Verificamos si están visibles (display: flex)
    const detalleAbierto = modalDetalle && modalDetalle.style.display === 'flex';
    const formularioAbierto = modalFormulario && modalFormulario.style.display === 'flex';

    // Si hay ventanas abiertas, NO actualizamos
    if (detalleAbierto || formularioAbierto) {
        return; 
    }

    // 2. Detectar qué pestaña estás viendo
    const tabClientes = document.getElementById('tab-clientes');
    const tabFacturas = document.getElementById('tab-facturas');

    // 3. Actualizar la tabla correspondiente
    if (tabClientes && tabClientes.classList.contains('active')) {
        console.log("🔄 Auto-actualizando tabla Clientes...");
        cargarClientes(currentPage); 
    } 
    else if (tabFacturas && tabFacturas.classList.contains('active')) {
        console.log("🔄 Auto-actualizando tabla Facturas...");
        cargarFacturas(currentFacturaPage);
    }

}, 30000); // 30 Segundos


