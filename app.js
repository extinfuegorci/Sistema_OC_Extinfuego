// ==========================================
// 1. CONFIGURACIÓN Y CONEXIÓN CON SUPABASE
// ==========================================
// ⚠️ Reemplaza estos valores con las credenciales de tu panel de Supabase
// (Project Settings > API)
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_KEY = 'TU-ANON-KEY-DE-SUPABASE';

// Inicialización del cliente
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. NAVEGACIÓN Y CAMBIO DE VISTAS
// ==========================================
function cambiarVista(idVista) {
    document.querySelectorAll('.vista').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`vista-${idVista}`).classList.add('active');
    
    const titulos = {
        'dashboard': 'Dashboard General',
        'nueva-orden': 'Emisión de Orden de Compra',
        'clientes': 'Gestión de Clientes y Empresas',
        'usuarios': 'Control de Usuarios y Permisos',
        'bitacora': 'Bitácora de Auditoría'
    };
    document.getElementById('titulo-seccion').innerText = titulos[idVista] || 'Sistema OC';
    
    // Cargar datos automáticamente según la pestaña
    if (idVista === 'clientes') cargarClientes();
    if (idVista === 'usuarios') cargarUsuarios();
    if (idVista === 'bitacora') cargarBitacora();
    if (idVista === 'dashboard') cargarOrdenesDashboard();
}

// ==========================================
// 3. GESTIÓN DE MODALES
// ==========================================
function abrirModal(idModal) {
    document.getElementById(idModal).style.display = 'flex';
}

function cerrarModal(idModal) {
    document.getElementById(idModal).style.display = 'none';
}

// NAVEGACIÓN ENTRE VISTAS
function cambiarVista(idVista) {
    document.querySelectorAll('.vista').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(`vista-${idVista}`).classList.add('active');
    event.currentTarget.classList.add('active');

    const titulos = {
        'dashboard': 'Dashboard General',
        'nueva-orden': 'Crear Orden de Compra',
        'clientes': 'Gestión de Clientes',
        'usuarios': 'Usuarios y Permisos',
        'bitacora': 'Bitácora de Auditoría'
    };
    document.getElementById('titulo-seccion').innerText = titulos[idVista] || '';
}

// CONTROL DE MODALES
function abrirModal(id) { document.getElementById(id).style.display = 'flex'; }
function cerrarModal(id) { document.getElementById(id).style.display = 'none'; }

// MANEJO DE LA TABLA DINÁMICA DE ÍTEMS
function agregarFilaItem() {
    const tbody = document.getElementById('items-body');
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
        <td><button class="btn-icon" onclick="eliminarFila(this)"><i class="ri-delete-bin-line"></i></button></td>
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

    const dctoPct = parseFloat(document.getElementById('descuento-pct').value) || 0;
    const montoDescuento = subtotalGeneral * (dctoPct / 100);
    const totalFinal = subtotalGeneral - montoDescuento;

    document.getElementById('lbl-subtotal').innerText = subtotalGeneral.toFixed(2);
    document.getElementById('lbl-total').innerText = totalFinal.toFixed(2);
}

// INICIALIZACIÓN CON 3 FILAS VACÍAS
window.onload = () => {
    agregarFilaItem();
    agregarFilaItem();
    agregarFilaItem();
};
