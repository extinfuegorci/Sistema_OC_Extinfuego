// ==========================================
// 1. CONFIGURACIÓN Y CONEXIÓN CON SUPABASE
// ==========================================
const SUPABASE_URL = 'https://ijoclanarnmlbajefcpx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlqb2NsYW5hcm5tbGJhamVmY3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3Mjg5NzYsImV4cCI6MjEwMDMwNDk3Nn0.KMFLOyp_CDQLEpnMQDxRh3t99BHst8nXseaMxu-SF_g';

// Inicialización del cliente
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. NAVEGACIÓN Y CAMBIO DE VISTAS
// ==========================================
function cambiarVista(idVista, btnElement = null) {
    // Ocultar todas las vistas y desactivar botones
    document.querySelectorAll('.vista').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    // Activar vista seleccionada
    const vistaDestino = document.getElementById(`vista-${idVista}`);
    if (vistaDestino) vistaDestino.classList.add('active');

    // Activar botón presionado si se pasó como parámetro
    if (btnElement) {
        btnElement.classList.add('active');
    }

    // Actualizar título
    const titulos = {
        'dashboard': 'Dashboard General',
        'nueva-orden': 'Emisión de Orden de Compra',
        'clientes': 'Gestión de Clientes y Empresas',
        'usuarios': 'Control de Usuarios y Permisos',
        'bitacora': 'Bitácora de Auditoría'
    };
    const elemTitulo = document.getElementById('titulo-seccion');
    if (elemTitulo) elemTitulo.innerText = titulos[idVista] || 'Sistema OC';

    // Cargar datos dinámicos desde Supabase según la pestaña
    if (idVista === 'clientes') cargarClientes();
    if (idVista === 'usuarios') if (typeof cargarUsuarios === 'function') cargarUsuarios();
    if (idVista === 'bitacora') if (typeof cargarBitacora === 'function') cargarBitacora();
    if (idVista === 'dashboard') if (typeof cargarOrdenesDashboard === 'function') cargarOrdenesDashboard();
}

// ==========================================
// 3. GESTIÓN DE MODALES
// ==========================================
function abrirModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.style.display = 'flex';
}

function cerrarModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.style.display = 'none';
}

// ==========================================
// 4. TABLA DINÁMICA DE ÍTEMS (ÓRDENES DE COMPRA)
// ==========================================
function agregarFilaItem() {
    const tbody = document.getElementById('items-body');
    if (!tbody) return;

    const numFila = tbody.children.length + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="text-center">${numFila}</td>
        <td><input type="number" value="1" min="1" class="item-cant" onchange="calcularTotales()" style="width: 100%;"></td>
        <td>
            <select class="item-unidad" style="width: 100%;">
                <option value="GLB">GLB</option>
                <option value="PZA">PZA</option>
                <option value="MTR">MTR</option>
                <option value="SER">SER</option>
            </select>
        </td>
        <td><input type="text" placeholder="Descripción del ítem..." class="item-desc" style="width: 100%;"></td>
        <td><input type="number" value="0.00" step="0.01" class="item-precio" onchange="calcularTotales()" style="width: 100%;"></td>
        <td class="item-subtotal-txt" style="font-weight: bold;">0.00</td>
        <td><button type="button" class="btn-icon" onclick="eliminarFila(this)"><i class="ri-delete-bin-line"></i></button></td>
    `;
    tbody.appendChild(tr);
    calcularTotales();
}

function eliminarFila(btn) {
    btn.closest('tr').remove();
    reenumerarItems();
    calcularTotales();
}

function reenumerarItems() {
    const filas = document.querySelectorAll('#items-body tr');
    filas.forEach((tr, index) => {
        tr.children[0].innerText = index + 1;
    });
}

function calcularTotales() {
    let subtotalGeneral = 0;
    const filas = document.querySelectorAll('#items-body tr');

    filas.forEach(tr => {
        const cant = parseFloat(tr.querySelector('.item-cant').value) || 0;
        const precio = parseFloat(tr.querySelector('.item-precio').value) || 0;
        const subtotalFila = cant * precio;

        tr.querySelector('.item-subtotal-txt').innerText = subtotalFila.toFixed(2);
        subtotalGeneral += subtotalFila;
    });

    const elemDcto = document.getElementById('descuento-pct');
    const dctoPct = elemDcto ? (parseFloat(elemDcto.value) || 0) : 0;
    const montoDescuento = subtotalGeneral * (dctoPct / 100);
    const totalFinal = subtotalGeneral - montoDescuento;

    const lblSubtotal = document.getElementById('lbl-subtotal');
    const lblTotal = document.getElementById('lbl-total');
    if (lblSubtotal) lblSubtotal.innerText = subtotalGeneral.toFixed(2);
    if (lblTotal) lblTotal.innerText = totalFinal.toFixed(2);
}

// ==========================================
// 5. FUNCIONES DE CLIENTES (CRUD SUPABASE)
// ==========================================
async function cargarClientes() {
    const tbody = document.getElementById('tabla-clientes-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Cargando datos de Supabase...</td></tr>';

    const { data: clientes, error } = await _supabase
        .from('clientes')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error('Error al cargar clientes:', error.message);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error al consultar la base de datos.</td></tr>';
        return;
    }

    if (!clientes || clientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay clientes registrados aún.</td></tr>';
        return;
    }

    tbody.innerHTML = clientes.map(c => `
        <tr>
            <td>${c.nit_ci || 'S/N'}</td>
            <td><strong>${c.razon_social}</strong></td>
            <td>${c.contacto || '-'}</td>
            <td>${c.telefono || '-'}</td>
            <td>${c.direccion || '-'}</td>
            <td><span class="badge ${c.estado ? 'badge-success' : 'text-danger'}">${c.estado ? 'Activo' : 'Inactivo'}</span></td>
            <td>
                <button class="btn-icon" title="Editar"><i class="ri-edit-line"></i></button>
            </td>
        </tr>
    `).join('');
}

async function guardarNuevoCliente(event) {
    if (event) event.preventDefault();

    const nit_ci = document.getElementById('cliente-nit').value;
    const razon_social = document.getElementById('cliente-razon').value;
    const nombre_completo = document.getElementById('cliente-contacto').value;
    const telefono = document.getElementById('cliente-telefono').value;
    const direccion = document.getElementById('cliente-direccion').value;

    if (!razon_social) {
        alert('Por favor ingrese la Razón Social o Nombre de la Empresa.');
        return;
    }

    const { data, error } = await _supabase
        .from('clientes')
        .insert([
            { nit_ci, razon_social, contacto, telefono, direccion, estado: true }
        ]);

    if (error) {
        alert('Error al registrar cliente: ' + error.message);
    } else {
        alert('Cliente registrado con éxito.');
        cerrarModal('modal-nuevo-cliente');
        
        // Limpiar formulario
        const form = document.getElementById('form-nuevo-cliente');
        if (form) form.reset();

        cargarClientes(); // Recargar la tabla automáticamente
    }
}

// ==========================================
// 6. INICIALIZACIÓN DE LA APLICACIÓN
// ==========================================
window.onload = () => {
    // Cargar filas iniciales en el formulario de nueva orden
    agregarFilaItem();
    agregarFilaItem();
    agregarFilaItem();
};
