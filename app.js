const SUPABASE_URL = 'https://ijoclanarnmlbajefcpx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlqb2NsYW5hcm5tbGJhamVmY3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3Mjg5NzYsImV4cCI6MjEwMDMwNDk3Nn0.KMFLOyp_CDQLEpnMQDxRh3t99BHst8nXseaMxu-SF_g';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const btnVerPassword = document.getElementById('btn-ver-password');
const inputPassword = document.getElementById('input-password');
const MAX_INTENTOS = 5;
const TIEMPO_BLOQUEO_MINUTOS = 5;
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
// Función para proteger las rutas
// Función para proteger las rutas (Adaptado para un solo archivo - SPA)
async function protegerRuta() {
  const { data: { session } } = await _supabase.auth.getSession();
  const loginSection = document.getElementById('login-section');
  const appLayout = document.getElementById('app-layout');

  if (session) {
    // Si hay sesión, ocultamos el login y mostramos el panel
    if(loginSection) loginSection.style.display = 'none';
    if(appLayout) appLayout.style.display = 'flex';
  } else {
    // Si NO hay sesión, mostramos el login y ocultamos el panel
    if(loginSection) loginSection.style.display = 'flex';
    if(appLayout) appLayout.style.display = 'none';
  }
}
// Dibujo vectorial del ojo normal
const svgOjo = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';

// Dibujo vectorial del ojo tachado (cerrado)
const svgOjoCerrado = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';

btnVerPassword.addEventListener('click', function() {
  const tipoActual = inputPassword.getAttribute('type');
  const iconoSvg = this.querySelector('svg');
  
  if (tipoActual === 'password') {
    inputPassword.setAttribute('type', 'text');
    iconoSvg.innerHTML = svgOjoCerrado; // Cambia al ojo tachado
  } else {
    inputPassword.setAttribute('type', 'password');
    iconoSvg.innerHTML = svgOjo; // Vuelve al ojo normal
  }
});
// Ejecutar la protección apenas cargue el script
protegerRuta();

// Escuchar si la sesión se cierra mientras el usuario navega
// Escuchar si la sesión se cierra mientras el usuario navega
_supabase.auth.onAuthStateChange((event, session) => {
  const loginSection = document.getElementById('login-section');
  const appLayout = document.getElementById('app-layout');

  if (event === 'SIGNED_OUT' || !session) {
    // Al cerrar sesión, volvemos a mostrar la pantalla de login
    if(loginSection) loginSection.style.display = 'flex';
    if(appLayout) appLayout.style.display = 'none';
  }
});

// --------------------------------------------------------
// A partir de aquí hacia abajo, puedes dejar tu código actual
// con la función iniciarSesion() y demás...
// --------------------------------------------------------
async function iniciarSesion(event) {
  event.preventDefault(); // Fundamental: evita que la página se recargue al darle click al botón

  // Obtenemos los valores de los inputs usando sus IDs del HTML
  const correo = document.getElementById('login-user').value;
  const passwordInput = document.getElementById('input-password').value;

  // 1. Verificar si el usuario está actualmente bloqueado en este navegador
  const tiempoDesbloqueo = localStorage.getItem('tiempoDesbloqueo');
  
  if (tiempoDesbloqueo && Date.now() < parseInt(tiempoDesbloqueo)) {
    const minutosRestantes = Math.ceil((parseInt(tiempoDesbloqueo) - Date.now()) / 60000);
    alert(`Por seguridad, debes esperar ${minutosRestantes} minutos antes de volver a intentarlo.`);
    return; // Detiene la ejecución, no consulta a Supabase
  }

  // 2. Intentar el inicio de sesión con Supabase (usando _supabase, no supabase global)
  // Nota: Asegúrate de que el usuario esté introduciendo un correo válido en el campo de "Usuario"
  const { data, error } = await _supabase.auth.signInWithPassword({
    email: correo, 
    password: passwordInput,
  });

  if (error) {
    // 3. Lógica en caso de error (credenciales incorrectas)
    let intentosActuales = parseInt(localStorage.getItem('intentosFallidos') || '0');
    intentosActuales++;
    
    if (intentosActuales >= MAX_INTENTOS) {
      // Bloquear: calcular la hora futura en milisegundos
      const milisegundosBloqueo = TIEMPO_BLOQUEO_MINUTOS * 60 * 1000;
      localStorage.setItem('tiempoDesbloqueo', Date.now() + milisegundosBloqueo);
      localStorage.setItem('intentosFallidos', '0'); // Reiniciar el contador para el futuro
      
      alert(`Has superado los ${MAX_INTENTOS} intentos. Sistema bloqueado temporalmente.`);
    } else {
      // Guardar el nuevo número de intentos fallidos
      localStorage.setItem('intentosFallidos', intentosActuales.toString());
      
      // Mostrar el mensaje en el DIV de error de tu HTML
      const errorDiv = document.getElementById('login-error');
      if (errorDiv) {
          errorDiv.style.display = 'block';
          errorDiv.innerText = `Credenciales incorrectas. Intento ${intentosActuales} de ${MAX_INTENTOS}.`;
      } else {
          alert(`Credenciales incorrectas. Intento ${intentosActuales} de ${MAX_INTENTOS}.`);
      }
    }
  } else {
    // 4. Lógica en caso de éxito
    localStorage.removeItem('intentosFallidos');
    localStorage.removeItem('tiempoDesbloqueo');
    
    // Guardamos la sesión localmente para tu función verificarSesionPrevia()
    localStorage.setItem('sesion_activa', JSON.stringify({
        nombre_completo: data.user.email, // Tomamos el email temporalmente como nombre
        privilegio_id: 1 // Forzamos rol de admin para que pases la pantalla de login (luego lo conectaremos a tu tabla perfiles)
    }));

    // Recargamos la página para que verificarSesionPrevia() oculte el login y muestre el dashboard
    window.location.reload(); 
  }
}

// También debes actualizar la función cerrarSesion:
async function cerrarSesion() {
    await _supabase.auth.signOut(); // Destruye el token seguro en el servidor
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
// FUNCIÓN 1: Actualizar Datos e Inactivar
// ==========================================
async function guardarEdicionUsuario(authId, nuevoCi, nuevoNombre, nuevoPrivilegio, estaActivo) {
    try {
        const { data, error } = await _supabase
            .from('usuarios')
            .update({
                ci: nuevoCi,
                nombre_completo: nuevoNombre,
                privilegio_id: nuevoPrivilegio,
                activo: estaActivo // true para activo, false para Inactivar
            })
            .eq('auth_id', authId);

        if (error) throw error;

        alert("Los datos del usuario se han actualizado correctamente.");
        // Aquí deberías llamar a la función que recarga tu tabla HTML de usuarios
        // cargarTablaUsuarios(); 
        
    } catch (error) {
        console.error("Error al actualizar usuario:", error);
        alert("Hubo un problema al guardar los cambios.");
    }
}

// ==========================================
// FUNCIÓN 2: Desbloqueo Manual Rápido
// ==========================================
async function desbloquearUsuario(authId) {
    // Preguntamos para confirmar antes de ejecutar
    if (!confirm("¿Estás seguro de que deseas desbloquear a este usuario para que vuelva a intentar ingresar?")) {
        return;
    }

    try {
        // Llamamos a la función SQL que creamos en el paso 1 usando .rpc()
        const { error } = await _supabase.rpc('desbloquear_usuario_manual', { 
            uid: authId 
        });

        if (error) throw error;

        alert("¡Usuario desbloqueado con éxito! Ya puede intentar ingresar inmediatamente.");
        
    } catch (error) {
        console.error("Error al desbloquear:", error);
        alert("No se pudo desbloquear al usuario. Revisa la consola.");
    }
}

// ==========================================
// CARGAR TABLA DE USUARIOS
// ==========================================
async function cargarUsuarios() {
    const tbody = document.getElementById('tabla-usuarios-body');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Cargando usuarios...</td></tr>';

    try {
        // Pedimos los datos a la tabla 'usuarios'
        // NOTA: Ajusta 'privilegio_id' o 'roles' según cómo se llame en tu base de datos
        const { data: usuarios, error } = await _supabase
            .from('usuarios')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        tbody.innerHTML = ''; // Limpiamos el mensaje de "cargando"

        usuarios.forEach(user => {
            // Dar formato a la fecha
            const fecha = new Date(user.created_at).toLocaleDateString('es-ES');
            
            // Estado visual
            const badgeEstado = user.activo 
                ? `<span style="color: green; font-weight: bold;">Activo</span>` 
                : `<span style="color: red; font-weight: bold;">Inactivo</span>`;

            // Creamos la fila
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.ci || '-'}</td>
                <td>${user.nombre_completo || '-'}</td>
                <td>${user.email || 'Sin correo'}</td>
                <td>${user.privilegio_id || 'Sin rol'}</td>
                <td>${badgeEstado}</td>
                <td>${fecha}</td>
                <td>
                    <!-- Botón para Editar (Pasa todos los datos al modal) -->
                    <button class="btn btn-sm btn-primary" 
                        onclick="abrirModalEdicion('${user.auth_id}', '${user.ci}', '${user.nombre_completo}', '${user.privilegio_id}', ${user.activo})" 
                        title="Editar Usuario">
                        <i class="ri-edit-line"></i>
                    </button>
                    
                    <!-- Botón para Desbloquear de emergencia -->
                    <button class="btn btn-sm" style="background-color: #f59e0b; color: white;" 
                        onclick="desbloquearUsuario('${user.auth_id}')" 
                        title="Desbloquear intentos fallidos">
                        <i class="ri-lock-unlock-line"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error al cargar usuarios:", error);
        tbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error al cargar la lista</td></tr>`;
    }
}

// ==========================================
// ABRIR MODAL CON DATOS CARGADOS
// ==========================================
function abrirModalEdicion(authId, ci, nombre, privilegio, activo) {
    // Llenamos los inputs del modal con los datos de la fila
    document.getElementById('edit-auth-id').value = authId;
    document.getElementById('edit-ci').value = ci !== 'null' ? ci : '';
    document.getElementById('edit-nombre').value = nombre !== 'null' ? nombre : '';
    document.getElementById('edit-privilegio').value = privilegio;
    document.getElementById('edit-estado').value = activo ? 'true' : 'false';

    // Mostramos el modal
    document.getElementById('modal-editar-usuario').style.display = 'flex';
}

// ==========================================
// PROCESAR EL BOTÓN "GUARDAR CAMBIOS" DEL MODAL
// ==========================================
async function procesarEdicion() {
    // 1. Obtenemos lo que el administrador escribió en el modal
    const authId = document.getElementById('edit-auth-id').value;
    const nuevoCi = document.getElementById('edit-ci').value;
    const nuevoNombre = document.getElementById('edit-nombre').value;
    const nuevoPrivilegio = document.getElementById('edit-privilegio').value;
    const estaActivo = document.getElementById('edit-estado').value === 'true'; // Convierte el string a booleano

    // 2. Usamos la función de actualización de Supabase que armamos antes
    try {
        const { error } = await _supabase
            .from('usuarios')
            .update({
                ci: nuevoCi,
                nombre_completo: nuevoNombre,
                privilegio_id: parseInt(nuevoPrivilegio),
                activo: estaActivo
            })
            .eq('auth_id', authId);

        if (error) throw error;

        alert("Usuario actualizado correctamente");
        
        // 3. Cerramos el modal y recargamos la tabla para ver los cambios
        document.getElementById('modal-editar-usuario').style.display = 'none';
        cargarUsuarios(); 

    } catch (error) {
        console.error("Error al actualizar:", error);
        alert("Ocurrió un error al actualizar los datos.");
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
