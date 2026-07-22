// ==========================================
// 1. CONFIGURACIÓN Y CONEXIÓN CON SUPABASE
// ==========================================
const SUPABASE_URL = 'https://ijoclanarnmlbajefcpx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlqb2NsYW5hcm5tbGJhamVmY3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3Mjg5NzYsImV4cCI6MjEwMDMwNDk3Nn0.KMFLOyp_CDQLEpnMQDxRh3t99BHst8nXseaMxu-SF_g';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. SISTEMA DE LOGIN Y PRIVILEGIOS (NUEVO)
// ==========================================
async function hashearPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function iniciarSesion(event) {
    event.preventDefault();
    const userNick = document.getElementById('login-user').value.trim();
    const userPass = document.getElementById('login-pass').value;
    const errorMsg = document.getElementById('login-error');
    if(errorMsg) errorMsg.style.display = 'none';

    try {
        const hashedPass = await hashearPassword(userPass);

        const { data: usuarios, error } = await _supabase
            .from('usuarios')
            .select('*')
            .eq('usuario', userNick)
            .eq('contrasenia_hash', hashedPass)
            .eq('activo', true);

        if (error) throw error;

        if (usuarios && usuarios.length > 0) {
            const usuarioAutenticado = usuarios[0];
            localStorage.setItem('sesion_activa', JSON.stringify(usuarioAutenticado));
            
            configurarEntornoUsuario(usuarioAutenticado);
            
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('app-layout').style.display = 'flex';
            cambiarVista('dashboard');
        } else {
            if(errorMsg) errorMsg.style.display = 'block';
        }
    } catch (error) {
            console.error("Error detallado:", error);
            // Mostrar el error real que nos devuelve Supabase
            alert("Error de Supabase: " + error.message); 
        }
}

function cerrarSesion() {
    localStorage.removeItem('sesion_activa');
    window.location.reload();
}

function configurarEntornoUsuario(usuario) {
    const elemUser = document.getElementById('ui-user-name');
    const elemRol = document.getElementById('ui-user-rol');
    
    if(elemUser) elemUser.innerText = usuario.nombre_completo;
    
    const roles = { 1: 'Administrador', 2: 'Operador', 3: 'Encargado', 4: 'Lector' };
    if(elemRol) elemRol.innerText = roles[usuario.privilegio_id] || 'Desconocido';

    // Control de vistas en el menú según el rol
    const navUsuarios = document.querySelector('button[onclick="cambiarVista(\'usuarios\', this)"]');
    const navBitacora = document.querySelector('button[onclick="cambiarVista(\'bitacora\', this)"]');
    const navNuevaOrden = document.querySelector('button[onclick="cambiarVista(\'nueva-orden\', this)"]');
    
    if(navUsuarios) navUsuarios.style.display = 'none';
    if(navBitacora) navBitacora.style.display = 'none';
    if(navNuevaOrden) navNuevaOrden.style.display = 'flex';

    switch(usuario.privilegio_id) {
        case 1: // Administrador
            if(navUsuarios) navUsuarios.style.display = 'flex';
            if(navBitacora) navBitacora.style.display = 'flex';
            break;
        case 3: // Encargado
            if(navBitacora) navBitacora.style.display = 'flex';
            break;
        case 4: // Lector
            if(navNuevaOrden) navNuevaOrden.style.display = 'none';
            break;
    }
}

function verificarSesionPrevia() {
    const sesion = localStorage.getItem('sesion_activa');
    const appLayout = document.getElementById('app-layout');
    const loginSection = document.getElementById('login-section');

    if (sesion) {
        const usuario = JSON.parse(sesion);
        configurarEntornoUsuario(usuario);
        if(loginSection) loginSection.style.display = 'none';
        if(appLayout) appLayout.style.display = 'flex';
        // No cambiamos la vista aquí para respetar la inicialización normal
    } else {
        if(loginSection) loginSection.style.display = 'flex';
        if(appLayout) appLayout.style.display = 'none';
    }
}

// ==========================================
// 3. NAVEGACIÓN Y CAMBIO DE VISTAS
// ==========================================
function cambiarVista(idVista, btnElement = null) {
    document.querySelectorAll('.vista').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const vistaDestino = document.getElementById(`vista-${idVista}`);
    if (vistaDestino) vistaDestino.classList.add('active');

    if (btnElement) {
        btnElement.classList.add('active');
    }

    const titulos = {
        'dashboard': 'Dashboard General',
        'nueva-orden': 'Emisión de Orden de Compra',
        'clientes': 'Gestión de Clientes y Empresas',
        'usuarios': 'Control de Usuarios y Permisos',
        'bitacora': 'Bitácora de Auditoría'
    };
    const elemTitulo = document.getElementById('titulo-seccion');
    if (elemTitulo) elemTitulo.innerText = titulos[idVista] || 'Sistema OC';

    if (idVista === 'clientes') cargarClientes();
    if (idVista === 'usuarios') cargarUsuarios(); // Llama a la nueva función
}

function abrirModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.style.display = 'flex';
}

function cerrarModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.style.display = 'none';
}

// ==========================================
// 4. TABLA DINÁMICA DE ÍTEMS (ÓRDENES DE COMPRA) - INTACTO
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
// 5. FUNCIONES DE CLIENTES (CRUD) - INTACTO
// ==========================================
async function cargarClientes() {
    const tbody = document.getElementById('tabla-clientes-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Cargando datos de Supabase...</td></tr>';

    const { data: clientes, error } = await _supabase
        .from('clientes')
        .select(`
            *,
            contactos_cliente ( nombre_completo )
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error al cargar clientes:', error.message);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error al consultar la base de datos.</td></tr>';
        return;
    }

    if (!clientes || clientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay clientes registrados aún.</td></tr>';
        return;
    }

    tbody.innerHTML = clientes.map(c => {
        let nombreContacto = '-';
        if (c.contactos_cliente && c.contactos_cliente.length > 0) {
            nombreContacto = c.contactos_cliente[0].nombre_completo || '-';
        }
        return `
            <tr>
                <td>${c.nit_ci || 'S/N'}</td>
                <td><strong>${c.razon_social}</strong></td>
                <td>${nombreContacto}</td>
                <td>${c.telefono || '-'}</td>
                <td>${c.direccion || '-'}</td>
                <td><span class="badge ${c.activo ? 'badge-success' : 'text-danger'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td><button class="btn-icon" title="Editar"><i class="ri-edit-line"></i></button></td>
            </tr>
        `;
    }).join('');
}

async function guardarNuevoCliente(event) {
    if (event) event.preventDefault();

    const nit_ci = document.getElementById('cliente-nit').value;
    const razon_social = document.getElementById('cliente-razon').value;
    const nombre_completo = document.getElementById('cliente-contacto').value;
    const telefono = document.getElementById('cliente-telefono').value;
    const direccion = document.getElementById('cliente-direccion').value;
    
    const correoElem = document.getElementById('cliente-correo');
    const correo = correoElem ? correoElem.value : '';

    if (!razon_social) {
        alert('Por favor ingrese la Razón Social o Nombre de la Empresa.');
        return;
    }

    const { data: clienteData, error: errorCliente } = await _supabase
        .from('clientes')
        .insert([{ 
            nit_ci: nit_ci, 
            razon_social: razon_social, 
            telefono: telefono, 
            direccion: direccion, 
            activo: true
        }])
        .select(); 

    if (errorCliente) {
        alert('Error al registrar la empresa: ' + errorCliente.message);
        return;
    }

    if (clienteData && clienteData.length > 0 && nombre_completo) {
        const clienteId = clienteData[0].id;
        const { error: errorContacto } = await _supabase
            .from('contactos_cliente')
            .insert([{ 
                cliente_id: clienteId, 
                nombre_completo: nombre_completo,
                telefono: telefono,
                correo: correo
            }]);
            
        if (errorContacto) console.error("Error guardando el contacto:", errorContacto.message);
    }

    alert('Cliente registrado con éxito.');
    cerrarModal('modal-nuevo-cliente');
    
    const form = document.getElementById('form-nuevo-cliente');
    if (form) form.reset();
    cargarClientes(); 
}

// ==========================================
// 6. FUNCIONES DE USUARIOS (CRUD NUEVO)
// ==========================================
async function cargarUsuarios() {
    const tbody = document.getElementById('tabla-usuarios-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Cargando usuarios...</td></tr>';

    const { data: usuarios, error } = await _supabase
        .from('usuarios')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error al cargar usuarios.</td></tr>';
        return;
    }

    if (!usuarios || usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay usuarios registrados.</td></tr>';
        return;
    }

    const roles = { 1: 'Administrador', 2: 'Operador', 3: 'Encargado', 4: 'Lector' };

    tbody.innerHTML = usuarios.map(u => `
        <tr>
            <td>${u.ci}</td>
            <td><strong>${u.nombre_completo}</strong></td>
            <td>${u.usuario}</td>
            <td>${roles[u.privilegio_id]}</td>
            <td><span class="badge ${u.activo ? 'badge-success' : 'text-danger'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td>${new Date(u.created_at).toLocaleDateString()}</td>
            <td><button class="btn-icon" title="Editar"><i class="ri-edit-line"></i></button></td>
        </tr>
    `).join('');
}

async function guardarNuevoUsuario(event) {
    event.preventDefault();

    const ci = document.getElementById('usuario-ci').value;
    const nombreCompleto = document.getElementById('usuario-nombre').value;
    const usuario = document.getElementById('usuario-nick').value;
    const passwordPlana = document.getElementById('usuario-pass').value;
    const privilegioId = parseInt(document.getElementById('usuario-privilegio').value, 10);
    const activo = document.getElementById('usuario-activo').checked;

    try {
        const contraseniaHash = await hashearPassword(passwordPlana);

        const { error } = await _supabase
            .from('usuarios')
            .insert([{
                ci: ci,
                nombre_completo: nombreCompleto,
                usuario: usuario,
                contrasenia_hash: contraseniaHash,
                privilegio_id: privilegioId,
                activo: activo
            }]);

        if (error) throw error;

        alert('Usuario registrado exitosamente.');
        document.getElementById('form-nuevo-usuario').reset();
        cerrarModal('modal-nuevo-usuario');
        cargarUsuarios();

    } catch (error) {
        console.error("Error al guardar el usuario:", error);
        alert("Ocurrió un error al registrar el usuario.");
    }
}

// ==========================================
// 7. INICIALIZACIÓN DE LA APLICACIÓN
// ==========================================
window.onload = () => {
    // Tus filas por defecto
    agregarFilaItem();
    agregarFilaItem();
    agregarFilaItem();
    
    // Autenticación
    verificarSesionPrevia();
};
