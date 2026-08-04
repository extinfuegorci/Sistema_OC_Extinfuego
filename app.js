// ==========================================
// 1. CONFIGURACIÓN Y CONSTANTES
// ==========================================
const SUPABASE_URL = 'https://ijoclanarnmlbajefcpx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlqb2NsYW5hcm5tbGJhamVmY3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3Mjg5NzYsImV4cCI6MjEwMDMwNDk3Nn0.KMFLOyp_CDQLEpnMQDxRh3t99BHst8nXseaMxu-SF_g';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const MAX_INTENTOS = 5;
const TIEMPO_BLOQUEO_MINUTOS = 5;
// Variable global para saber si estamos buscando CLIENTE o PROVEEDOR
let tipoBusquedaActual = '';
// ==========================================
// 2. INICIALIZACIÓN DE LA APLICACIÓN
// ==========================================
window.onload = () => {
    verificarSesionPrevia();
    configurarOjoPassword();
    cargarListaPrivilegios(); // <-- CORRECCIÓN: Ahora la app descarga los roles al iniciar
    _supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        // Solo cargar los datos si ya confirmó que hay sesión
        cargarDashboard(); 
    } else {
        console.log("No hay sesión activa, redirigiendo al login...");
        // window.location.href = 'login.html';
    }
});
    // ==========================================
    // LÓGICA DE INTERFAZ: FORMA DE PAGO
    // ==========================================
    
    const selectFormaPago = document.getElementById('forma-pago');
    const contenedorCredito = document.getElementById('contenedor-credito');
    const contenedorAnticipo = document.getElementById('contenedor-anticipo');
    
    // Inputs que necesitan validación dinámica
    const inputFechaVencimiento = document.getElementById('fecha-vencimiento');
    const inputMontoPagado = document.getElementById('monto-pagado');
    
    if (selectFormaPago) {
        selectFormaPago.addEventListener('change', function() {
            const forma = this.value;
    
            // 1. Ocultar todos los contenedores y limpiar validaciones por defecto
            contenedorCredito.style.display = 'none';
            contenedorAnticipo.style.display = 'none';
            
            inputFechaVencimiento.required = false;
            inputMontoPagado.required = false;
    
            // Limpiar los valores al cambiar de opción para evitar datos basura
            inputFechaVencimiento.value = '';
            inputMontoPagado.value = '';
            document.getElementById('porcentaje-anticipo').value = '';
    
            // 2. Mostrar el contenedor correspondiente y exigir el dato obligatorio
            if (forma === 'CREDITO') {
                contenedorCredito.style.display = 'block';
                inputFechaVencimiento.required = true; // Obligamos a poner fecha
                
            } else if (forma === 'ANTICIPO') {
                contenedorAnticipo.style.display = 'block';
                inputMontoPagado.required = true; // Obligamos a poner el monto adelantado
            }
        });
    }
    // Generar las 3 filas por defecto para Órdenes de Compra
    for (let i = 0; i < 1; i++) agregarFilaItem();
};

// ==========================================
// 3. SEGURIDAD, RUTAS Y AUTENTICACIÓN
// ==========================================

// Listener Global: Detecta si la sesión caduca o se cierra automáticamente
_supabase.auth.onAuthStateChange((event, session) => {
    const loginSection = document.getElementById('login-section');
    const appLayout = document.getElementById('app-layout');

    if (event === 'SIGNED_OUT' || !session) {
        if (loginSection) loginSection.style.display = 'flex';
        if (appLayout) appLayout.style.display = 'none';
    } else {
        if (loginSection) loginSection.style.display = 'none';
        if (appLayout) appLayout.style.display = 'flex';
    }
});

async function iniciarSesion(event) {
    event.preventDefault();
    const correo = document.getElementById('login-user').value;
    const passwordInput = document.getElementById('input-password').value;

    // 1. Intentamos el inicio de sesión con Supabase Auth PRIMERO
    const { data, error } = await _supabase.auth.signInWithPassword({
        email: correo,
        password: passwordInput,
    });

    // 2. Si hay ERROR de contraseña o el correo no existe
    if (error) {
        // Anotamos el fallo en la base de datos (Suma los reintentos)
        const { data: falloData, error: errorRpc } = await _supabase.rpc('registrar_intento_fallido', {
            p_correo: correo, 
            p_max: MAX_INTENTOS, 
            p_minutos: TIEMPO_BLOQUEO_MINUTOS
        });
        if (errorRpc) {
            console.error("🚨 Error al registrar el intento fallido en Supabase:", errorRpc);
        }
        const intentos = falloData ? falloData.intentos : 1;
        
        if (falloData && falloData.bloqueado) {
            alert(`Has superado los ${MAX_INTENTOS} intentos. Cuenta bloqueada temporalmente.`);
        } else {
            const errorDiv = document.getElementById('login-error');
            if (errorDiv) {
                errorDiv.style.display = 'block';
                errorDiv.innerText = `Credenciales incorrectas. Intento ${intentos} de ${MAX_INTENTOS}.`;
            } else {
                alert(`Credenciales incorrectas. Intento ${intentos} de ${MAX_INTENTOS}.`);
            }
        }
        return; // Detenemos la ejecución aquí, no avanza.
    }

    // 3. Si la contraseña es CORRECTA, verificamos las REGLAS en tu tabla pública usando su auth_id infalible
    if (data.user) {
        const { data: userData, error: userError } = await _supabase
            .from('usuarios')
            .select('activo, bloqueado_hasta, nombre_completo, privilegio_id, privilegios(nombre)')
            .eq('auth_id', data.user.id)
            .single();

        if (userData) {
            // REGLA A: ¿El administrador lo marcó como INACTIVO (False)?
            if (userData.activo === false) {
                await _supabase.auth.signOut(); // LO EXPULSAMOS AL INSTANTE
                return alert("❌ Tu cuenta está inactiva. Por favor, contacta al administrador.");
            }

            // REGLA B: ¿Acertó la clave pero su tiempo de castigo (candado rojo) aún no termina?
            const fechaBloqueo = userData.bloqueado_hasta ? new Date(userData.bloqueado_hasta).getTime() : 0;
            if (fechaBloqueo > Date.now()) {
                await _supabase.auth.signOut(); // LO EXPULSAMOS AL INSTANTE
                const tiempoRestante = Math.ceil((fechaBloqueo - Date.now()) / 60000);
                return alert(`Tu cuenta sigue bloqueada por intentos fallidos. Debes esperar ${tiempoRestante} minutos.`);
            }

            // REGLA C: ÉXITO TOTAL. Pasó la contraseña, está activo y no tiene bloqueos.
            // Limpiamos su historial de fallos para dejar su candado en verde
            await _supabase.rpc('desbloquear_usuario_manual', { uid: data.user.id });

            localStorage.setItem('sesion_activa', JSON.stringify({
                nombre_completo: userData.nombre_completo || data.user.email,
                privilegio_id: userData.privilegio_id || 4,
                rol_nombre: userData.privilegios ? userData.privilegios.nombre : 'Desconocido'
            }));

            window.location.reload(); // Entramos al panel
        } else {
            // Si el usuario existe en Auth pero no se copió a tu tabla pública (prevención de errores)
            await _supabase.auth.signOut();
            return alert("❌ Error: Tu usuario no figura en la base de datos pública. Contacta a soporte.");
        }
    }
}

async function cerrarSesion() {
    await _supabase.auth.signOut();
    localStorage.removeItem('sesion_activa');
    window.location.reload();
}

function verificarSesionPrevia() {
    const sesion = localStorage.getItem('sesion_activa');
    if (sesion) configurarEntornoUsuario(JSON.parse(sesion));
}

function configurarEntornoUsuario(usuario) {
    const elemUser = document.getElementById('ui-user-name');
    const elemRol = document.getElementById('ui-user-rol');
    
    if (elemUser) elemUser.innerText = usuario.nombre_completo;
    if (elemRol) elemRol.innerText = usuario.rol_nombre || 'Desconocido';

    const navUsuarios = document.querySelector('button[onclick="cambiarVista(\'usuarios\', this)"]');
    const navBitacora = document.querySelector('button[onclick="cambiarVista(\'bitacora\', this)"]');
    const navNuevaOrden = document.querySelector('button[onclick="cambiarVista(\'nueva-orden\', this)"]');
    
    if (navUsuarios) navUsuarios.style.display = 'none';
    if (navBitacora) navBitacora.style.display = 'none';
    if (navNuevaOrden) navNuevaOrden.style.display = 'flex';

    switch (usuario.privilegio_id) {
        case 1: // Admin
            if (navUsuarios) navUsuarios.style.display = 'flex';
            if (navBitacora) navBitacora.style.display = 'flex';
            break;
        case 3: // Encargado
            if (navBitacora) navBitacora.style.display = 'flex';
            break;
        case 4: // Lector
            if (navNuevaOrden) navNuevaOrden.style.display = 'none';
            break;
    }
}

// ==========================================
// 4. GESTIÓN DE INTERFAZ Y VISTAS
// ==========================================
function cambiarVista(idVista, btnElement = null) {
    // 1. Mostrar la pantalla de transición palpitante
    const loader = document.getElementById('pantalla-carga');
    if (loader) loader.style.display = 'flex';

    // 2. Esperar 800ms para mostrar la animación antes de cambiar la vista
    setTimeout(() => {
        document.querySelectorAll('.vista').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        const vistaDestino = document.getElementById(`vista-${idVista}`);
        if (vistaDestino) vistaDestino.classList.add('active');
        if (btnElement) btnElement.classList.add('active');

        const titulos = {
            'dashboard': 'Dashboard General',
            'nueva-orden': 'Emisión de Orden de Compra',
            'clientes': 'Gestión de Clientes y Empresas',
            'usuarios': 'Control de Usuarios y Permisos',
            'bitacora': 'Bitácora de Auditoría',
            'aprobaciones': 'Módulo de Aprobaciones'
        };
        
        const elemTitulo = document.getElementById('titulo-seccion');
        if (elemTitulo) elemTitulo.innerText = titulos[idVista] || 'Sistema OC';

        if (idVista === 'clientes') cargarClientes();
        if (idVista === 'usuarios') cargarUsuarios();
        if (idVista === 'dashboard') cargarDashboard();
        if (idVista === 'aprobaciones') cargarAprobaciones();

        // 3. Ocultar la pantalla de transición
        if (loader) loader.style.display = 'none';
        
    }, 500); // 500 milisegundos de tiempo
}

function abrirModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.style.display = 'flex';
}

function cerrarModal(idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.style.display = 'none';
}

function configurarOjoPassword() {
    const btnVerPassword = document.getElementById('btn-ver-password');
    const inputPassword = document.getElementById('input-password');
    if (!btnVerPassword || !inputPassword) return;

    const svgOjo = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    const svgOjoCerrado = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';

    btnVerPassword.addEventListener('click', function() {
        const iconoSvg = this.querySelector('svg');
        if (inputPassword.getAttribute('type') === 'password') {
            inputPassword.setAttribute('type', 'text');
            iconoSvg.innerHTML = svgOjoCerrado;
        } else {
            inputPassword.setAttribute('type', 'password');
            iconoSvg.innerHTML = svgOjo;
        }
    });
}

// ==========================================
// 5. GESTIÓN DE USUARIOS Y ROLES (CRUD)
// ==========================================
async function hashearPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function cargarListaPrivilegios() {
    const { data: privilegios, error } = await _supabase.from('privilegios').select('*').order('id', { ascending: true });
    
    if (error) return console.error("Error cargando privilegios:", error);

    let opcionesHTML = '<option value="">Seleccione un rol...</option>';
    privilegios.forEach(priv => {
        opcionesHTML += `<option value="${priv.id}">${priv.id}. ${priv.nombre}</option>`;
    });

    const selectCrear = document.getElementById('rol-nuevo-usuario');
    const selectEditar = document.getElementById('edit-privilegio');
    
    if (selectCrear) selectCrear.innerHTML = opcionesHTML;
    if (selectEditar) selectEditar.innerHTML = opcionesHTML;
}

async function cargarUsuarios() {
    const tbody = document.getElementById('tabla-usuarios-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Cargando usuarios...</td></tr>';

    const { data: usuarios, error } = await _supabase
        .from('usuarios')
        .select(`*, privilegios ( nombre )`)
        .order('created_at', { ascending: false });

    if (error || !usuarios || usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center ${error ? 'text-danger' : ''}">${error ? 'Error al cargar.' : 'No hay usuarios.'}</td></tr>`;
        return;
    }

    tbody.innerHTML = usuarios.map(u => {
        const estaBloqueado = u.bloqueado_hasta && new Date(u.bloqueado_hasta).getTime() > Date.now();
        const btnCandado = estaBloqueado
            ? `<button class="btn btn-sm" style="background-color: #dc2626; color: white; margin-left: 5px;" onclick="desbloquearUsuario('${u.auth_id}')" title="Desbloquear"><i class="ri-lock-2-line"></i></button>`
            : `<button class="btn btn-sm" style="background-color: #10b981; color: white; margin-left: 5px;" onclick="desbloquearUsuario('${u.auth_id}')" title="Reiniciar contador"><i class="ri-lock-unlock-line"></i></button>`;

        // <-- CORRECCIÓN: Leemos el nombre del rol dinámicamente desde el JOIN
        const nombreRol = u.privilegios ? u.privilegios.nombre : 'Desconocido';

        return `
        <tr>
            <td>${u.ci || '-'}</td>
            <td><strong>${u.nombre_completo || '-'}</strong></td>
            <td>${u.usuario || '-'}</td>
            <td>${nombreRol}</td>
            <td><span class="badge ${u.activo ? 'badge-success' : 'text-danger'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td>${new Date(u.created_at).toLocaleDateString('es-ES')}</td>
            <td>
                <button class="btn-icon" onclick="abrirModalEdicion('${u.auth_id}', '${u.ci}', '${u.nombre_completo}', '${u.privilegio_id}', ${u.activo})" title="Editar"><i class="ri-edit-line"></i></button>
                <button class="btn btn-sm" style="background-color: #3b82f6; color: white; margin-left: 5px;" onclick="cambiarPassword('${u.auth_id}')" title="Cambiar Password"><i class="ri-key-line"></i></button>
                ${btnCandado}
            </td>
        </tr>`;
    }).join('');
}



async function guardarNuevoUsuario(event) {
    event.preventDefault();
    try {
        const correo = document.getElementById('usuario-nick').value;
        const password = document.getElementById('usuario-pass').value;
        const ci = document.getElementById('usuario-ci').value;
        const nombre = document.getElementById('usuario-nombre').value;
        const privilegio_id = parseInt(document.getElementById('rol-nuevo-usuario').value, 10);
        const activo = document.getElementById('usuario-activo').checked;

        if (password.length < 6) {
            alert("⚠️ La contraseña es muy corta. Debe tener al menos 6 caracteres.");
            return; // El 'return' detiene la función aquí mismo y no envía nada a Supabase
        }

        const regexCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!regexCorreo.test(correo)) {
            alert("⚠️ El formato del correo no es válido. Asegúrate de incluir el símbolo '@' y un dominio (ejemplo: nombre@empresa.com).");
            return; 
        }
        
        // 1. Llamamos a la Edge Function usando el método oficial de Supabase (evita el error JWT)
        const { data: resultado, error: errorFuncion } = await _supabase.functions.invoke('crear-usuario', {
            body: { email: correo, password: password }
        });

        // Validamos si falló la conexión con la función
        if (errorFuncion) {
            throw new Error("Error de autorización o red: " + errorFuncion.message);
        }

        // Validamos si la Edge Function se ejecutó pero devolvió un error (ej. contraseña corta o correo duplicado)
        if (resultado && resultado.error) {
            throw new Error(resultado.error);
        }

        const nuevoAuthId = resultado.user.id; // ¡Capturamos el ID seguro de Auth!

        // 2. Guardamos o actualizamos los datos en tu tabla pública ENLAZANDO el auth_id
        // Cambiamos .insert() por .upsert() para evitar el choque de duplicados
        const { error: dbError } = await _supabase.from('usuarios').upsert([{
            auth_id: nuevoAuthId,
            ci: ci,
            nombre_completo: nombre,
            usuario: correo,
            privilegio_id: privilegio_id,
            activo: activo
        }], { 
            onConflict: 'usuario' 
        });

        if (dbError) throw dbError;

        alert('Usuario registrado exitosamente.');
        document.getElementById('form-nuevo-usuario').reset();
        cerrarModal('modal-nuevo-usuario');
        cargarUsuarios();

    } catch (error) {
        console.error("Error al registrar usuario:", error);
        alert("Ocurrió un error: " + error.message);
    }
}

function abrirModalEdicion(auth_id, ci, nombre, privilegio_id, activo) {
    document.getElementById('edit-auth-id').value = auth_id;
    document.getElementById('edit-ci').value = ci;
    document.getElementById('edit-nombre').value = nombre;
    document.getElementById('edit-privilegio').value = privilegio_id; 
    document.getElementById('edit-estado').value = activo ? 'true' : 'false';
    abrirModal('modal-editar-usuario');
}

async function procesarEdicion() {
    try {
        const authId = document.getElementById('edit-auth-id').value;
        const { error } = await _supabase.from('usuarios').update({
            ci: document.getElementById('edit-ci').value,
            nombre_completo: document.getElementById('edit-nombre').value,
            privilegio_id: parseInt(document.getElementById('edit-privilegio').value, 10),
            activo: document.getElementById('edit-estado').value === 'true'
        }).eq('auth_id', authId);

        if (error) throw error;
        alert("Usuario actualizado correctamente");
        cerrarModal('modal-editar-usuario');
        cargarUsuarios(); 
    } catch (error) {
        alert("Ocurrió un error al actualizar los datos.");
    }
}

async function desbloquearUsuario(authId) {
    if (!confirm("¿Deseas resetear los intentos de acceso y desbloquear a este usuario?")) return;
    try {
        const { error } = await _supabase.rpc('desbloquear_usuario_manual', { uid: authId });
        if (error) throw error;
        alert("✅ Usuario desbloqueado.");
        cargarUsuarios(); 
    } catch (error) {
        alert("❌ No se pudo conectar con la base de datos.");
    }
}

async function cambiarPassword(authId) {
    const nuevaPassword = prompt("Ingresa la nueva contraseña para este usuario (mínimo 6 caracteres):");
    if (!nuevaPassword) return; 
    if (nuevaPassword.length < 6) return alert("⚠️ La contraseña debe tener al menos 6 caracteres.");

    try {
        const { error } = await _supabase.rpc('cambiar_password_usuario', { uid: authId, nueva_pass: nuevaPassword });
        if (error) throw error;
        alert("✅ Contraseña actualizada con éxito.");
    } catch (error) {
        alert("❌ Hubo un error al intentar cambiar la contraseña.");
    }
}

// ==========================================
// 6. GESTIÓN DE CLIENTES Y ÓRDENES DE COMPRA
// ==========================================
async function cargarClientes() {
    const tbody = document.getElementById('tabla-clientes-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Cargando datos...</td></tr>';

    // Se agrega "id" en el select de contactos_cliente para poder identificarlo al editar
    const { data: clientes, error } = await _supabase
        .from('clientes')
        .select('*, contactos_cliente(id, nombre_completo)')
        .order('created_at', { ascending: false });
    
    if (error || !clientes || clientes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center ${error ? 'text-danger' : ''}">${error ? 'Error al cargar.' : 'No hay clientes registrados.'}</td></tr>`;
        return;
    }

    tbody.innerHTML = clientes.map(c => {
        // Validación de seguridad por si una empresa no tiene contacto registrado
        const contacto = c.contactos_cliente && c.contactos_cliente.length > 0 ? c.contactos_cliente[0] : null;
        const contactoId = contacto ? contacto.id : '';
        // Escapamos comillas simples para evitar que se rompa el HTML si una empresa se llama "McDonald's"
        const contactoNombre = contacto ? contacto.nombre_completo.replace(/'/g, "\\'") : '';
        const razonSocialEscapada = (c.razon_social || '').replace(/'/g, "\\'");

        return `
        <tr>
            <td>${c.nit_ci || 'S/N'}</td>
            <td><strong>${c.razon_social}</strong></td>
            <td>${contacto ? contacto.nombre_completo : '-'}</td>
            <td>${c.telefono || '-'}</td>
            <td>${c.direccion || '-'}</td>
            <td><span class="badge ${c.activo ? 'badge-success' : 'text-danger'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td>
                <!-- El botón ahora dispara la función pasando todos los datos de la fila -->
                <button class="btn-icon" onclick="abrirModalEdicionCliente('${c.id}', '${c.nit_ci || ''}', '${razonSocialEscapada}', '${contactoId}', '${contactoNombre}', '${c.telefono || ''}', '${c.direccion || ''}', ${c.activo})" title="Editar"><i class="ri-edit-line"></i></button>
            </td>
        </tr>`;
    }).join('');
}

async function guardarNuevoCliente(event) {
    if (event) event.preventDefault();
    
    // Usamos ?.value || '' para evitar que colapse si el campo no existe en el HTML
    const nit_ci = document.getElementById('cliente-nit')?.value || 'S/N';
    const razon_social = document.getElementById('cliente-razon')?.value || '';
    const tipo = document.getElementById('cliente-tipo')?.value || 'CLIENTE'; 
    const telefono_empresa = document.getElementById('cliente-telefono')?.value || '';
    const direccion_empresa = document.getElementById('cliente-direccion')?.value || '';
    
    if (!razon_social) return alert('⚠️ Por favor ingrese la Razón Social o Nombre de la Empresa.');

    try {
        // Inserción del Cliente/Proveedor
        const { data: clienteData, error: errorCliente } = await _supabase
            .from('clientes')
            .insert([{ 
                nit_ci: nit_ci, 
                razon_social: razon_social, 
                tipo: tipo,
                telefono: telefono_empresa, 
                direccion: direccion_empresa, 
                activo: true
            }])
            .select(); 

        if (errorCliente) throw errorCliente;

        // Inserción del Contacto (si se llenó el campo)
        const nombre_completo = document.getElementById('cliente-contacto')?.value || '';
        if (clienteData?.length > 0 && nombre_completo.trim() !== '') {
            const correo_contacto = document.getElementById('cliente-correo')?.value || '';
            
            await _supabase.from('contactos_cliente').insert([{ 
                cliente_id: clienteData[0].id, 
                nombre_completo: nombre_completo,
                telefono: telefono_empresa,
                correo: correo_contacto
            }]);
        }
        
        alert('✅ Registrado con éxito.');
        document.getElementById('form-nuevo-cliente')?.reset();
        cerrarModal('modal-nuevo-cliente');
        
        // Refrescar la tabla si existe la función
        if (typeof cargarClientes === 'function') {
            cargarClientes(); 
        }
        
        // Si estábamos en medio de una Orden de Compra, volver al buscador
        if (document.getElementById('vista-nueva-orden')?.classList.contains('active') && tipoBusquedaActual) {
            abrirModalBusqueda(tipoBusquedaActual);
        }

    } catch (error) {
        console.error('Error guardando:', error);
        alert('❌ Error al registrar la empresa: ' + error.message);
    }
}

// ==========================================
// NUEVO FLUJO DE BÚSQUEDA DINÁMICA
// ==========================================

async function abrirModalBusqueda(tipo) {
    tipoBusquedaActual = tipo; // 'CLIENTE' o 'PROVEEDOR'
    
    // Actualizar interfaz del modal
    document.getElementById('titulo-modal-busqueda').innerHTML = `🔍 Seleccionar ${tipo === 'CLIENTE' ? 'Cliente' : 'Proveedor'}`;
    document.getElementById('input-filtro-busqueda').value = '';
    
    const tbody = document.getElementById('tabla-busqueda-body');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center">Cargando...</td></tr>';
    
    abrirModal('modal-busqueda');

    // Traer datos de Supabase filtrados por tipo y que estén activos
    const { data, error } = await _supabase
        .from('clientes')
        .select('*, contactos_cliente(nombre_completo)')
        .eq('tipo', tipo)
        .eq('activo', true)
        .order('razon_social', { ascending: true });

    if (error || !data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center">No hay registros de tipo ${tipo}.</td></tr>`;
        return;
    }

    // Dibujar la tabla
    tbody.innerHTML = data.map(item => {
        const contacto = item.contactos_cliente && item.contactos_cliente.length > 0 ? item.contactos_cliente[0].nombre_completo : '';
        // Pasamos los datos limpiando comillas para evitar errores de sintaxis
        const razonLimpia = item.razon_social.replace(/'/g, "\\'");
        const contactoLimpio = contacto.replace(/'/g, "\\'");
        
        return `
        <tr class="fila-busqueda">
            <td class="busqueda-razon"><strong>${item.razon_social}</strong></td>
            <td class="busqueda-nit">${item.nit_ci || 'S/N'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="seleccionarEntidad('${razonLimpia}', '${item.nit_ci || ''}', '${contactoLimpio}')">
                    Seleccionar
                </button>
            </td>
        </tr>`;
    }).join('');
}

// Función que se ejecuta al darle al botón rojo "Seleccionar" en la tabla
function seleccionarEntidad(nombre, nit, contacto) {
    if (tipoBusquedaActual === 'PROVEEDOR') {
        document.getElementById('proveedor-nombre').value = nombre;
        document.getElementById('contacto-nombre').value = contacto;
    } else if (tipoBusquedaActual === 'CLIENTE') {
        document.getElementById('facturar-a').value = nombre;
        document.getElementById('nit-factura').value = nit;
    }
    cerrarModal('modal-busqueda');
}

// Pequeño filtro en memoria para la barra de búsqueda del modal
function filtrarTablaBusqueda() {
    const texto = document.getElementById('input-filtro-busqueda').value.toLowerCase();
    const filas = document.querySelectorAll('.fila-busqueda');
    
    filas.forEach(fila => {
        const razon = fila.querySelector('.busqueda-razon').innerText.toLowerCase();
        const nit = fila.querySelector('.busqueda-nit').innerText.toLowerCase();
        if (razon.includes(texto) || nit.includes(texto)) {
            fila.style.display = '';
        } else {
            fila.style.display = 'none';
        }
    });
}

// Si no lo encuentra, redirige al modal de creación
function redirigirCreacionEntidad() {
    cerrarModal('modal-busqueda');
    document.getElementById('cliente-tipo').value = tipoBusquedaActual; // Preselecciona el combo
    abrirModal('modal-nuevo-cliente');
}

async function guardarOrdenCompra() {
    try {
        // 1. Recolectar datos principales
        const tipoCodigoId = document.getElementById('tipo_codigo_id')?.value;
        const correlativoActual = document.getElementById('correlativo_actual')?.value;
        const numeroOc = document.getElementById('oc-num').value; 
        
        const proveedor = document.getElementById('proveedor-nombre').value;
        const contacto = document.getElementById('contacto-nombre').value;
        const fechaSolicitud = document.getElementById('fecha-solicitud').value;
        const fechaEntrega = document.getElementById('fecha-entrega').value;
        const facturarA = document.getElementById('facturar-a').value;
        const nitFactura = document.getElementById('nit-factura').value;
        const empresaSolicitante = document.getElementById('empresa-solicitante').value;
        const formaPago = document.getElementById('forma-pago').value;
        const observacion = document.getElementById('observacion').value;
        
        // Totales calculados de la UI
        const subtotal = parseFloat(document.getElementById('lbl-subtotal').innerText) || 0;
        const descuento = parseFloat(document.getElementById('descuento-pct').value) || 0;
        const total = parseFloat(document.getElementById('lbl-total').innerText) || 0;

        // Lógica de pagos inicial
        let montoPagadoFinal = 0;
        let fechaVencimientoFinal = null;
        let porcentajeAnticipoFinal = null;

        if (formaPago === 'CONTADO') {
            montoPagadoFinal = total;
        } else if (formaPago === 'CREDITO') {
            fechaVencimientoFinal = document.getElementById('fecha-vencimiento')?.value || null;
            if (!fechaVencimientoFinal) return alert('⚠️ Por favor, ingresa la fecha de vencimiento para el crédito.');
        } else if (formaPago === 'ANTICIPO') {
            montoPagadoFinal = parseFloat(document.getElementById('monto-pagado')?.value) || 0;
            porcentajeAnticipoFinal = parseFloat(document.getElementById('porcentaje-anticipo')?.value) || null;
            if (montoPagadoFinal <= 0) return alert('⚠️ Por favor, ingresa un monto de anticipo válido mayor a 0.');
        }

        // ==========================================
        // 2. VALIDACIONES (MODIFICADO PARA EDICIÓN)
        // ==========================================
        // Solo exigimos un nuevo tipo de código si es una Orden NUEVA
        if (!idOrdenActualEdicion && (!tipoCodigoId || !numeroOc)) {
            return alert('⚠️ Por favor, haz clic en OC Nº y selecciona un código.');
        }
        
        if (!proveedor) return alert('⚠️ Por favor, ingresa el nombre del proveedor.');
        if (!fechaSolicitud) return alert('⚠️ Por favor, selecciona la fecha de solicitud.');
        if (!formaPago) return alert('⚠️ Por favor, selecciona una forma de pago.');
        if (total <= 0) return alert('⚠️ El total debe ser mayor a 0.');

        // ==========================================
        // 3. GUARDADO: PRINCIPAL (INSERT O UPDATE)
        // ==========================================
        const datosOrden = {
            numero_oc: numeroOc,
            proveedor_nombre: proveedor,
            contacto_nombre: contacto,
            fecha_solicitud: fechaSolicitud,
            fecha_entrega: fechaEntrega || null, 
            facturar_a: facturarA,
            nit_factura: nitFactura,
            empresa_solicitante: empresaSolicitante,
            forma_pago: formaPago,
            subtotal: subtotal,
            descuento_porcentaje: descuento,
            monto_total: total,
            observacion: observacion,
            // Solo establecemos el estado PENDIENTE si es nueva. Si es edición, mantenemos el que tiene.
            ...( !idOrdenActualEdicion && { estado: 'PENDIENTE' } ),
            monto_pagado: montoPagadoFinal, 
            fecha_vencimiento: fechaVencimientoFinal,
            porcentaje_anticipo: porcentajeAnticipoFinal
        };

        let idOrdenGenerada = idOrdenActualEdicion;

        if (idOrdenActualEdicion) {
            // A. MODO ACTUALIZACIÓN
            const { error: errorUpdate } = await _supabase
                .from('ordenes')
                .update(datosOrden)
                .eq('id', idOrdenActualEdicion);
            if (errorUpdate) throw new Error('Error al actualizar: ' + errorUpdate.message);
        } else {
            // B. MODO CREACIÓN
            const { data: ordenInsertada, error: errorOrden } = await _supabase
                .from('ordenes')
                .insert([datosOrden])
                .select(); 
            if (errorOrden) throw new Error('Error al guardar: ' + errorOrden.message);
            idOrdenGenerada = ordenInsertada[0].id;
        }

        // ==========================================
        // 4. GUARDADO: ÍTEMS Y PAGOS
        // ==========================================
        // Truco de edición: Borramos los ítems y pagos viejos de esta orden y guardamos exactamente lo que hay en pantalla
        if (idOrdenActualEdicion) {
            await _supabase.from('items_orden').delete().eq('orden_id', idOrdenGenerada);
            await _supabase.from('historial_pagos').delete().eq('orden_id', idOrdenGenerada);
        }

        // --- Guardar Ítems ---
        const filas = document.querySelectorAll('#items-body tr');
        const itemsAInsertar = [];
        filas.forEach((tr, index) => {
            const cant = parseFloat(tr.querySelector('.item-cant').value) || 0;
            const unidad = tr.querySelector('.item-unidad').value;
            const desc = tr.querySelector('.item-desc').value;
            const precio = parseFloat(tr.querySelector('.item-precio').value) || 0;

            if (desc.trim() !== '' && cant > 0) {
                itemsAInsertar.push({
                    orden_id: idOrdenGenerada, 
                    numero_item: index + 1,
                    cantidad: cant,
                    unidad: unidad,
                    descripcion: desc,
                    precio_unitario: precio
                });
            }
        });

        if (itemsAInsertar.length > 0) {
            const { error: errorItems } = await _supabase.from('items_orden').insert(itemsAInsertar);
            if (errorItems) throw new Error('Falló el guardado de ítems: ' + errorItems.message);
        }

        // --- Guardar Pagos ---
        if (formaPago === 'ANTICIPO' || formaPago === 'CREDITO') {
            const filasPagos = document.querySelectorAll('.fila-pago-borrador');
            const pagosAInsertar = [];
            filasPagos.forEach(tr => {
                pagosAInsertar.push({
                    orden_id: idOrdenGenerada,
                    numero_recibo: tr.dataset.recibo,
                    fecha_pago: tr.dataset.fecha,
                    monto: parseFloat(tr.dataset.monto)
                });
            });

            if (pagosAInsertar.length > 0) {
                const { error: errorPagos } = await _supabase.from('historial_pagos').insert(pagosAInsertar);
                if (errorPagos) console.error("Error al registrar los pagos:", errorPagos);
            }
        } else if (formaPago === 'CONTADO') {
            await _supabase.from('historial_pagos').insert([{
                orden_id: idOrdenGenerada,
                numero_recibo: 'PAGO-CONTADO',
                fecha_pago: fechaSolicitud,
                monto: total
            }]);
        }

        // ==========================================
        // 5. ACTUALIZAR CORRELATIVO (SOLO SI ES NUEVA)
        // ==========================================
        if (!idOrdenActualEdicion && tipoCodigoId) {
            const nuevoCorrelativo = parseInt(correlativoActual) + 1;
            await _supabase.from('tipos_codificacion').update({ correlativo: nuevoCorrelativo }).eq('id', tipoCodigoId);
        }

        // ==========================================
        // 6. ÉXITO Y LIMPIEZA
        // ==========================================
        alert(idOrdenActualEdicion ? '✅ ¡Orden actualizada con éxito!' : '✅ ¡Orden de Compra registrada con éxito!');
        
        // Limpiar inputs de texto
        const idsALimpiar = ['oc-num', 'tipo_codigo_id', 'codigo_prefijo', 'correlativo_actual', 
                             'proveedor-nombre', 'contacto-nombre', 'facturar-a', 'nit-factura', 
                             'observacion', 'fecha-solicitud', 'fecha-entrega'];
        idsALimpiar.forEach(id => {
            if (document.getElementById(id)) document.getElementById(id).value = '';
        });
        document.getElementById('descuento-pct').value = '0';
        
        // Limpiar select de pago
        const selectPago = document.getElementById('forma-pago');
        selectPago.value = '';
        selectPago.dispatchEvent(new Event('change'));
        
        // Reiniciar ítems
        document.getElementById('items-body').innerHTML = '';
        for (let i = 0; i < 1; i++) agregarFilaItem();
        calcularTotales(); 

        // Salir del modo edición
        idOrdenActualEdicion = null; 
        document.getElementById('botones-edicion-orden').style.display = 'none';
        document.getElementById('btn-guardar-orden').innerHTML = '<i class="ri-save-line"></i> Guardar Orden de Compra';

        // Volver al Dashboard automáticamente
        cambiarVista('dashboard');

    } catch (error) {
        console.error(error);
        alert('❌ Ocurrió un error: ' + error.message);
    }
}

// ==========================================
// MÓDULO: TIPOS DE CODIFICACIÓN (OC Nº)
// ==========================================

// 1. ABRIR MODAL
function abrirModalCodigos() {
    document.getElementById('modalCodigos').style.display = 'flex';
    cargarCodigos();
}

// 2. CERRAR MODAL
function cerrarModalCodigos() {
    document.getElementById('modalCodigos').style.display = 'none';
}

// 3. READ: Obtener los códigos desde Supabase
async function cargarCodigos() {
    const lista = document.getElementById('listaCodigos');
    lista.innerHTML = '<li style="padding: 10px;">Cargando...</li>';

    const { data, error } = await _supabase
        .from('tipos_codificacion')
        .select('*')
        .order('codigo', { ascending: true });

    if (error) {
        console.error("Error cargando códigos:", error);
        lista.innerHTML = '<li style="padding: 10px;">Error al cargar</li>';
        return;
    }

    lista.innerHTML = '';
    data.forEach(item => {
        lista.innerHTML += `
            <li style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee; align-items: center;">
                <span style="cursor: pointer; flex: 1; color: #333;" onclick="seleccionarCodigo('${item.id}', '${item.codigo}', ${item.correlativo})">
                    ${item.codigo} (${item.correlativo + 1})
                </span>
                <button type="button" onclick="eliminarCodigo('${item.id}', '${item.codigo}')" style="background-color: #e0e0e0; color: #333; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; padding: 6px 12px; display: flex; align-items: center; justify-content: center; font-size: 14px;">
                    🗑️
                </button>
            </li>
        `;
    });
}

// 4. CREATE: Agregar un nuevo tipo de código
async function agregarCodigo() {
    const input = document.getElementById('nuevoCodigoInput');
    const codigoValue = input.value.trim().toUpperCase();

    if (!codigoValue) {
        alert("Por favor, ingresa un código válido.");
        return;
    }

    const { data, error } = await _supabase
        .from('tipos_codificacion')
        .insert([{ codigo: codigoValue, correlativo: 0 }]);

    if (error) {
        if (error.code === '23505') { 
            alert("Este código ya existe.");
        } else {
            console.error("Error agregando código:", error);
            alert("Error al guardar el código.");
        }
        return;
    }

    input.value = ''; // Limpiar input después de guardar
    cargarCodigos(); // Recargar la lista visual
}

// 5. DELETE: Eliminar un código
async function eliminarCodigo(id, codigoNombre) {
    if (!confirm(`¿Estás seguro de eliminar la codificación ${codigoNombre}?`)) {
        return;
    }

    const { error } = await _supabase
        .from('tipos_codificacion')
        .delete()
        .eq('id', id);

    if (error) {
        console.error("Error eliminando:", error);
        alert("Error al eliminar.");
        return;
    }
    
    cargarCodigos();
}

// 6. SELECCIONAR: Poner el código formateado en el input principal
function seleccionarCodigo(id, codigo, correlativo) {
    const siguienteNumero = correlativo + 1;
    
    // Guardar datos ocultos
    document.getElementById('tipo_codigo_id').value = id;
    document.getElementById('codigo_prefijo').value = codigo;
    document.getElementById('correlativo_actual').value = correlativo;
    
    // Formato visual: [Número]-[CÓDIGO]
    document.getElementById('oc-num').value = `${siguienteNumero}-${codigo}`; // <-- CORREGIDO A 'oc-num'
    
    cerrarModalCodigos();
}

// 7. FILTRAR: Buscador en tiempo real dentro del modal
function filtrarCodigos() {
    const filtro = document.getElementById('buscarCodigo').value.toUpperCase();
    const items = document.getElementById('listaCodigos').getElementsByTagName('li');
    
    for (let i = 0; i < items.length; i++) {
        const span = items[i].getElementsByTagName("span")[0];
        if (span) {
            const texto = span.textContent || span.innerText;
            items[i].style.display = texto.toUpperCase().indexOf(filtro) > -1 ? "" : "none";
        }
    }
}
function abrirModalEdicionCliente(id, nit, razon, contactoId, contactoNombre, telefono, direccion, activo) {
    // 1. Llenamos el formulario con los datos actuales
    document.getElementById('edit-cliente-id').value = id;
    document.getElementById('edit-cliente-nit').value = nit;
    document.getElementById('edit-cliente-razon').value = razon;
    document.getElementById('edit-contacto-id').value = contactoId;
    document.getElementById('edit-cliente-contacto').value = contactoNombre;
    document.getElementById('edit-cliente-telefono').value = telefono;
    document.getElementById('edit-cliente-direccion').value = direccion;
    document.getElementById('edit-cliente-estado').value = activo ? 'true' : 'false';
    
    // 2. Mostramos el modal
    abrirModal('modal-editar-cliente');
}

async function procesarEdicionCliente(event) {
    event.preventDefault(); // Evitamos que recargue la página
    
    try {
        // Recolectamos los datos modificados por el usuario
        const clienteId = document.getElementById('edit-cliente-id').value;
        const nit = document.getElementById('edit-cliente-nit').value;
        const razon = document.getElementById('edit-cliente-razon').value;
        const tipo = document.getElementById('edit-cliente-tipo').value;
        const telefono = document.getElementById('edit-cliente-telefono').value;
        const direccion = document.getElementById('edit-cliente-direccion').value;
        const activo = document.getElementById('edit-cliente-estado').value === 'true';
        
        const contactoId = document.getElementById('edit-contacto-id').value;
        const contactoNombre = document.getElementById('edit-cliente-contacto').value;

        // 1. Actualizamos los datos principales en la tabla 'clientes'
        const { error: errCliente } = await _supabase
            .from('clientes')
            .update({
                nit_ci: nit,
                razon_social: razon,
                tipo: tipo,
                telefono: telefono,
                direccion: direccion,
                activo: activo
            })
            .eq('id', clienteId);

        if (errCliente) throw new Error('Error al actualizar la empresa: ' + errCliente.message);

        // 2. Actualizamos o Creamos el contacto asociado
        if (contactoNombre) {
            if (contactoId) {
                // Si ya existía un contacto, lo actualizamos
                const { error: errContacto } = await _supabase
                    .from('contactos_cliente')
                    .update({ nombre_completo: contactoNombre, telefono: telefono })
                    .eq('id', contactoId);
                if (errContacto) throw new Error('Error al actualizar contacto.');
            } else {
                // Si la empresa no tenía contacto y ahora le pusieron uno, lo insertamos
                const { error: errInsertContacto } = await _supabase
                    .from('contactos_cliente')
                    .insert([{ cliente_id: clienteId, nombre_completo: contactoNombre, telefono: telefono }]);
                if (errInsertContacto) throw new Error('Error al crear nuevo contacto.');
            }
        }

        // 3. Cerramos modal y recargamos la tabla
        alert('✅ Cliente actualizado correctamente.');
        cerrarModal('modal-editar-cliente');
        cargarClientes();

    } catch (error) {
        console.error("Error completo:", error);
        alert("❌ " + error.message);
    }
}

function agregarFilaItem() {
    const tbody = document.getElementById('items-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="text-center">${tbody.children.length + 1}</td>
        <td><input type="number" value="1" min="1" class="item-cant" onchange="calcularTotales()" style="width: 100%;"></td>
        <td><select class="item-unidad" style="width: 100%;"><option>GLB</option><option>PZA</option><option>MTR</option><option>SER</option></select></td>
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
    document.querySelectorAll('#items-body tr').forEach((tr, i) => tr.children[0].innerText = i + 1);
    calcularTotales();
}

function calcularTotales() {
    let subtotalGeneral = 0;
    document.querySelectorAll('#items-body tr').forEach(tr => {
        const subtotalFila = (parseFloat(tr.querySelector('.item-cant').value) || 0) * (parseFloat(tr.querySelector('.item-precio').value) || 0);
        tr.querySelector('.item-subtotal-txt').innerText = subtotalFila.toFixed(2);
        subtotalGeneral += subtotalFila;
    });
    
    const montoDescuento = subtotalGeneral * ((parseFloat(document.getElementById('descuento-pct')?.value) || 0) / 100);
    const lblSubtotal = document.getElementById('lbl-subtotal');
    const lblTotal = document.getElementById('lbl-total');
    
    if (lblSubtotal) lblSubtotal.innerText = subtotalGeneral.toFixed(2);
    if (lblTotal) lblTotal.innerText = (subtotalGeneral - montoDescuento).toFixed(2);

    // NUEVO: Sincronizar el total con el módulo de pagos
    if (typeof actualizarSaldosPagos === 'function') {
        actualizarSaldosPagos();
    }
    
}
// ==========================================
// CERRAR MODALES CON ESC O CLIC AFUERA
// ==========================================

// Detectar tecla ESC
window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modales = document.querySelectorAll('.modal');
        modales.forEach(modal => {
            if (modal.style.display === 'flex' || modal.style.display === 'block') {
                modal.style.display = 'none';
            }
        });
    }
});

// Detectar clic en la parte oscura del modal (fuera del contenido)
window.addEventListener('click', function(event) {
    // Si el elemento sobre el que hicimos clic tiene la clase 'modal' 
    // (el fondo gris semitransparente), lo cerramos.
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
});
// ==========================================
// MÓDULO DE DASHBOARD Y REPORTES
// ==========================================

// ==========================================
// MÓDULO DE DASHBOARD Y REPORTES
// ==========================================

async function cargarDashboard() {
    try {
        const tbody = document.getElementById('cuerpo-tabla-dashboard');
        
        // 1. Mostrar mensaje de carga
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px;">Cargando información... <i class="ri-loader-4-line ri-spin"></i></td></tr>';

        // 2. Consultar a Supabase
        const { data: ordenes, error } = await _supabase
            .from('ordenes')
            .select('*')
            .order('fecha_solicitud', { ascending: false });

        if (error) throw error;

        // 3. Variables para las métricas superiores
        let totalGastado = 0;
        let totalPagado = 0;
        let totalPendiente = 0;

        if (tbody) tbody.innerHTML = '';

        if (!ordenes || ordenes.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 20px;">No hay órdenes registradas aún.</td></tr>';
            return;
        }

        // Obtener la fecha de hoy a las 00:00:00 para comparar vencimientos justos
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        // 4. Recorrer cada orden
        ordenes.forEach(orden => {
            const monto = parseFloat(orden.monto_total) || 0;
            const pagado = parseFloat(orden.monto_pagado) || 0;
            const estadoActual = orden.estado || 'PENDIENTE';

            totalGastado += monto;
            
            // Calculamos métricas globales
            if (estadoActual === 'COMPLETADA' || estadoActual === 'APROBADO' || pagado >= monto) {
                totalPagado += pagado;
            }
            if (estadoActual !== 'ANULADA') {
                totalPendiente += (monto - pagado > 0 ? monto - pagado : 0);
            }

            // Formatear fechas de solicitud y entrega
            const fechaIngreso = orden.fecha_solicitud ? new Date(orden.fecha_solicitud + 'T00:00:00').toLocaleDateString('es-ES') : '-';
            const fechaEntrega = orden.fecha_entrega ? new Date(orden.fecha_entrega + 'T00:00:00').toLocaleDateString('es-ES') : '-';

            // ---------------------------------------------------------
            // LÓGICA 1: ESTADO DE ENTREGA
            // ---------------------------------------------------------
            let badgeEntrega = `<span style="background-color: #fef08a; color: #854d0e; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;">PENDIENTE</span>`; // AMARILLO por defecto
            
            if (estadoActual === 'COMPLETADA') {
                badgeEntrega = `<span style="background-color: #dbeafe; color: #1e3a8a; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;">ENTREGADA</span>`; // AZUL
            } else if (estadoActual === 'ANULADA') {
                badgeEntrega = `<span style="background-color: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;">ANULADA</span>`; // ROJO
            }

            // ---------------------------------------------------------
            // LÓGICA 2: ESTADO DE PAGO
            // ---------------------------------------------------------
            let badgePago = '';
            let fechaVenc = orden.fecha_vencimiento ? new Date(orden.fecha_vencimiento + 'T00:00:00') : null;

            if (pagado >= monto && monto > 0) {
                // Pagado completamente (AZUL)
                badgePago = `<span style="background-color: #dbeafe; color: #1e3a8a; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;">PAGADO</span>`;
            } else if (fechaVenc && hoy > fechaVenc) {
                // No está pagado completo y ya pasó la fecha de vencimiento (ROJO)
                badgePago = `<span style="background-color: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;">VENCIDO</span>`;
            } else {
                // No está pagado completo y aún está en fecha (AMARILLO)
                badgePago = `<span style="background-color: #fef08a; color: #854d0e; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;">PENDIENTE</span>`;
            }

            // Construir la fila con los nuevos badges
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 12px 16px; color: #334155; font-weight: 500;">${orden.numero_oc || '-'}</td>
                <td style="padding: 12px 16px; color: #475569;">${orden.facturar_a || orden.proveedor_nombre || '-'}</td>
                <td style="padding: 12px 16px; color: #475569;">${fechaIngreso}</td>
                <td style="padding: 12px 16px; color: #475569;">${fechaEntrega}</td>
                <td style="padding: 12px 16px;">${badgeEntrega}</td>
                <td style="padding: 12px 16px;">${badgePago}</td>
                <td style="padding: 12px 16px;">
                    <button class="btn-icon" onclick="editarOrden('${orden.id}')" title="Ver Detalles" style="background: none; border: none; cursor: pointer; color: #3b82f6; font-size: 18px;">
                        <i class="ri-eye-line"></i>
                    </button>
                </td>
            `;
            if (tbody) tbody.appendChild(tr);
        });

        // 5. Actualizar tarjetas superiores
        const metricGastado = document.getElementById('metric-total-gastado');
        const metricPagado = document.getElementById('metric-pagado');
        const metricPendiente = document.getElementById('metric-pendiente');

        if(metricGastado) metricGastado.innerText = `Bs. ${totalGastado.toFixed(2)}`;
        if(metricPagado) metricPagado.innerText = `Bs. ${totalPagado.toFixed(2)}`;
        if(metricPendiente) metricPendiente.innerText = `Bs. ${totalPendiente.toFixed(2)}`;

    } catch (error) {
        console.error("Error al cargar el dashboard:", error);
        alert("Ocurrió un problema al cargar los reportes. Revisa la consola.");
    }
}
// Mostrar/Ocultar el módulo según la forma de pago
document.getElementById('forma-pago').addEventListener('change', function() {
    const moduloPagos = document.getElementById('modulo-pagos');
    if (this.value === 'ANTICIPO' || this.value === 'CREDITO') {
        moduloPagos.style.display = 'block';
        // Sugerir la fecha de hoy por defecto en el input de pago
        document.getElementById('nuevo-pago-fecha').value = new Date().toISOString().split('T')[0];
    } else {
        moduloPagos.style.display = 'none';
        // Si eligen al contado, limpiamos la tabla para no guardar datos basura
        document.getElementById('tabla-borrador-pagos').innerHTML = `
            <tr id="fila-sin-pagos">
                <td colspan="4" class="text-center text-muted">Aún no se han registrado pagos para esta orden.</td>
            </tr>`;
    }
});

// Agregar pago a la tabla HTML (Borrador - Estilo Excel)
document.getElementById('btn-agregar-pago-ui').addEventListener('click', function() {
    const recibo = document.getElementById('nuevo-recibo').value; // Ahora lee el autogenerado
    const fecha = document.getElementById('nuevo-pago-fecha').value;
    const monto = parseFloat(document.getElementById('nuevo-pago-monto').value);
    const saldoActual = parseFloat(document.getElementById('pago-saldo-pendiente').innerText) || 0;

    if (!fecha || !monto || monto <= 0) {
        return alert("⚠️ Por favor, ingresa una fecha y un monto válido.");
    }
    
    // Pequeña validación por si el pago supera el saldo pendiente
    if (monto > saldoActual && saldoActual > 0) {
        if (!confirm(`⚠️ El monto a pagar (Bs. ${monto}) es mayor al saldo pendiente (Bs. ${saldoActual}). ¿Deseas agregarlo de todos modos?`)) {
            return;
        }
    }

    const tbody = document.getElementById('tabla-borrador-pagos');
    const filaVacia = document.getElementById('fila-sin-pagos');
    if (filaVacia) filaVacia.remove();

    const tr = document.createElement('tr');
    tr.className = 'fila-pago-borrador';
    tr.dataset.recibo = recibo;
    tr.dataset.fecha = fecha;
    tr.dataset.monto = monto;
    tr.style.borderBottom = "1px solid #cbd5e1";

    tr.innerHTML = `
        <td style="padding: 6px; border-right: 1px solid #cbd5e1;">${recibo}</td>
        <td style="padding: 6px; border-right: 1px solid #cbd5e1;">${fecha}</td>
        <td style="padding: 6px; border-right: 1px solid #cbd5e1; font-weight: bold;">${monto.toFixed(2)}</td>
        <td style="padding: 6px;">
            <button type="button" class="btn-eliminar-pago-ui" style="background: none; border: none; color: #ef4444; cursor: pointer;" title="Eliminar">
                <i class="ri-delete-bin-line"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);

    // Limpiamos solo el monto (dejamos la fecha por si quiere registrar varios pagos el mismo día)
    document.getElementById('nuevo-pago-monto').value = '';
    
    // ¡Recalculamos los saldos y autoincrementamos!
    actualizarSaldosPagos();
});

// Eliminar un pago de la tabla borrador
document.getElementById('tabla-borrador-pagos').addEventListener('click', function(e) {
    if (e.target.closest('.btn-eliminar-pago-ui')) {
        e.target.closest('tr').remove();
        
        // Si nos quedamos sin pagos, restauramos el mensaje vacío
        if (this.children.length === 0) {
            this.innerHTML = `
                <tr id="fila-sin-pagos">
                    <td colspan="4" style="padding: 10px; color: #94a3b8; font-style: italic;">Sin pagos registrados.</td>
                </tr>`;
        }
        
        // Re-enumerar las filas existentes para que el orden siga siendo 1, 2, 3...
        const filasRestantes = document.querySelectorAll('.fila-pago-borrador');
        filasRestantes.forEach((fila, index) => {
            const nuevoNumero = index + 1;
            fila.dataset.recibo = nuevoNumero; 
            fila.children[0].innerText = nuevoNumero; 
        });

        // Recalcular saldos
        actualizarSaldosPagos();
    }
});

function actualizarSaldosPagos() {
    // 1. Obtener Total de la Orden
    const totalOrden = parseFloat(document.getElementById('lbl-total').innerText) || 0;
    
    // 2. Sumar todos los pagos que estén en el borrador
    let totalPagado = 0;
    const filasPagos = document.querySelectorAll('.fila-pago-borrador');
    filasPagos.forEach(fila => {
        totalPagado += parseFloat(fila.dataset.monto) || 0;
    });
    
    // 3. Calcular el saldo
    let saldo = totalOrden - totalPagado;
    
    // 4. Escribir los valores en la tabla de pagos
    const lblTotalPagar = document.getElementById('pago-total-pagar');
    const lblTotalPagado = document.getElementById('pago-total-pagado');
    const lblSaldo = document.getElementById('pago-saldo-pendiente');
    
    if (lblTotalPagar) lblTotalPagar.innerText = totalOrden.toFixed(2);
    if (lblTotalPagado) lblTotalPagado.innerText = totalPagado.toFixed(2);
    if (lblSaldo) lblSaldo.innerText = saldo.toFixed(2);
    
    // 5. Autoincrementar el número del próximo pago (1, 2, 3...)
    const inputRecibo = document.getElementById('nuevo-recibo');
    if (inputRecibo) {
        inputRecibo.value = filasPagos.length + 1; 
    }
}
// Funciones de diseño para los estados
function obtenerBadgeEntrega(estado) {
    if (estado === 'ENTREGADO') {
        return `<span style="background-color: #dcfce3; color: #166534; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: bold; display: inline-flex; align-items: center; gap: 4px;"><i class="ri-checkbox-circle-line"></i> ENTREGADO</span>`;
    }
    return `<span style="background-color: #fef08a; color: #854d0e; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: bold; display: inline-flex; align-items: center; gap: 4px;"><i class="ri-time-line"></i> PENDIENTE</span>`;
}

function obtenerBadgePago(estado) {
    if (estado === 'PAGADO') {
        return `<span style="background-color: #dcfce3; color: #166534; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: bold; display: inline-flex; align-items: center; gap: 4px;"><i class="ri-money-dollar-circle-line"></i> PAGADO</span>`;
    }
    return `<span style="background-color: #fef08a; color: #854d0e; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: bold; display: inline-flex; align-items: center; gap: 4px;"><i class="ri-error-warning-line"></i> PEND. DE PAGO</span>`;
}

// Así debería verse el inyectado de la fila de tu Dashboard en tu función de obtenerOrdenes:
/* 
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="padding: 10px;">${orden.codigo_oc}</td>
        <td style="padding: 10px; font-weight: bold;">${orden.cliente_factura}</td>
        <td style="padding: 10px;">${orden.fecha_solicitud}</td>
        <td style="padding: 10px;">${orden.fecha_entrega}</td>
        <td style="padding: 10px;">${obtenerBadgeEntrega(orden.estado_entrega)}</td>
        <td style="padding: 10px;">${obtenerBadgePago(orden.estado_pago)}</td>
        <td style="padding: 10px; text-align: center;">
            <button onclick="editarOrden('${orden.id}')" style="background: none; border: none; cursor: pointer; color: #3b82f6; font-size: 18px;" title="Ver/Editar Orden">
                <i class="ri-eye-line"></i>
            </button>
        </td>
    `;
*/

// Variable global para saber qué orden estamos editando
let idOrdenActualEdicion = null;

window.editarOrden = async function(idOrden) {
    // Guardamos el ID globalmente para saber qué orden estamos afectando
    idOrdenActualEdicion = idOrden;
    
    try {
        // 1. Mostrar pantalla de carga
        const loader = document.getElementById('pantalla-carga');
        if (loader) loader.style.display = 'flex';
        console.log("Cargando datos de la orden ID:", idOrden);

        // 2. CONSULTAS A SUPABASE (Ejecutadas en paralelo para mayor velocidad)
        const [ordenRes, itemsRes, pagosRes] = await Promise.all([
            _supabase.from('ordenes').select('*').eq('id', idOrden).single(),
            _supabase.from('items_orden').select('*').eq('orden_id', idOrden).order('numero_item', { ascending: true }),
            _supabase.from('historial_pagos').select('*').eq('orden_id', idOrden).order('id', { ascending: true })
        ]);

        if (ordenRes.error) throw ordenRes.error;
        const orden = ordenRes.data;
        const items = itemsRes.data || [];
        const pagos = pagosRes.data || [];

        // 3. LLENAR CAMPOS PRINCIPALES DE CABECERA
        document.getElementById('oc-num').value = orden.numero_oc || '';
        document.getElementById('proveedor-nombre').value = orden.proveedor_nombre || '';
        document.getElementById('contacto-nombre').value = orden.contacto_nombre || '';
        document.getElementById('fecha-solicitud').value = orden.fecha_solicitud || '';
        document.getElementById('fecha-entrega').value = orden.fecha_entrega || '';
        document.getElementById('facturar-a').value = orden.facturar_a || '';
        document.getElementById('nit-factura').value = orden.nit_factura || '';
        document.getElementById('empresa-solicitante').value = orden.empresa_solicitante || 'EXTINFUEGO';
        document.getElementById('observacion').value = orden.observacion || '';
        document.getElementById('descuento-pct').value = orden.descuento_porcentaje || 0;

        // 4. LLENAR FORMA DE PAGO Y DISPARAR EVENTO PARA MOSTRAR/OCULTAR MÓDULOS
        const selectPago = document.getElementById('forma-pago');
        selectPago.value = orden.forma_pago || '';
        selectPago.dispatchEvent(new Event('change')); // Fuerza al HTML a mostrar Credito/Anticipo

        if (orden.forma_pago === 'CREDITO') {
            document.getElementById('fecha-vencimiento').value = orden.fecha_vencimiento || '';
        } else if (orden.forma_pago === 'ANTICIPO') {
            document.getElementById('monto-pagado').value = orden.monto_pagado || '';
            document.getElementById('porcentaje-anticipo').value = orden.porcentaje_anticipo || '';
        }

        // 5. LLENAR TABLA DE ÍTEMS (DETALLE)
        const tbodyItems = document.getElementById('items-body');
        tbodyItems.innerHTML = ''; // Limpiamos la fila vacía por defecto
        
        items.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-center">${index + 1}</td>
                <td><input type="number" value="${item.cantidad}" min="1" class="item-cant" onchange="calcularTotales()" style="width: 100%;"></td>
                <td>
                    <select class="item-unidad" style="width: 100%;">
                        <option value="GLB" ${item.unidad === 'GLB' ? 'selected' : ''}>GLB</option>
                        <option value="PZA" ${item.unidad === 'PZA' ? 'selected' : ''}>PZA</option>
                        <option value="MTR" ${item.unidad === 'MTR' ? 'selected' : ''}>MTR</option>
                        <option value="SER" ${item.unidad === 'SER' ? 'selected' : ''}>SER</option>
                    </select>
                </td>
                <td><input type="text" value="${item.descripcion}" class="item-desc" style="width: 100%;"></td>
                <td><input type="number" value="${item.precio_unitario}" step="0.01" class="item-precio" onchange="calcularTotales()" style="width: 100%;"></td>
                <td class="item-subtotal-txt" style="font-weight: bold;">0.00</td>
                <td><button type="button" class="btn-icon" onclick="eliminarFila(this)"><i class="ri-delete-bin-line"></i></button></td>
            `;
            tbodyItems.appendChild(tr);
        });

        // 6. LLENAR LA TABLA ESTILO EXCEL DE PAGOS (HISTORIAL)
        const tbodyPagos = document.getElementById('tabla-borrador-pagos');
        tbodyPagos.innerHTML = ''; // Limpiamos la tabla
        
        if (pagos.length > 0) {
            pagos.forEach(pago => {
                const tr = document.createElement('tr');
                tr.className = 'fila-pago-borrador';
                tr.dataset.recibo = pago.numero_recibo || '';
                tr.dataset.fecha = pago.fecha_pago || '';
                tr.dataset.monto = pago.monto || 0;
                tr.style.borderBottom = "1px solid #cbd5e1";
                
                tr.innerHTML = `
                    <td style="padding: 6px; border-right: 1px solid #cbd5e1;">${pago.numero_recibo}</td>
                    <td style="padding: 6px; border-right: 1px solid #cbd5e1;">${pago.fecha_pago}</td>
                    <td style="padding: 6px; border-right: 1px solid #cbd5e1; font-weight: bold;">${parseFloat(pago.monto).toFixed(2)}</td>
                    <td style="padding: 6px;">
                        <button type="button" class="btn-eliminar-pago-ui" style="background: none; border: none; color: #ef4444; cursor: pointer;" title="Eliminar">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </td>
                `;
                tbodyPagos.appendChild(tr);
            });
        } else {
            tbodyPagos.innerHTML = `
                <tr id="fila-sin-pagos">
                    <td colspan="4" style="padding: 10px; color: #94a3b8; font-style: italic;">Sin pagos registrados.</td>
                </tr>`;
        }

        // 7. HABILITAR EL MODO EDICIÓN EN LA INTERFAZ
        const divBotonesEdicion = document.getElementById('botones-edicion-orden');
        const btnGuardar = document.getElementById('btn-guardar-orden');

        // Limpiamos los botones dinámicos primero
        divBotonesEdicion.style.display = 'flex';
        divBotonesEdicion.innerHTML = ''; 

        if (orden.estado.startsWith('APROBACIÓN_')) {
            // CASO A: Está en proceso de revisión por el admin
            btnGuardar.style.display = 'none'; // Bloqueamos el guardado
            divBotonesEdicion.innerHTML = `<span style="padding: 10px; color: #854d0e; background: #fef08a; border-radius: 4px; font-weight: bold;"><i class="ri-time-line"></i> Orden bloqueada: Solicitud en revisión por Administración.</span>`;
        
        } else if (orden.estado === 'ANULADA') {
            // CASO B: Está anulada. Mostramos el botón de REHABILITAR
            btnGuardar.style.display = 'none'; // Bloqueamos el guardado
            divBotonesEdicion.innerHTML = `
                <button class="btn" style="background-color: #f59e0b; color: white; border: none; padding: 10px 15px; border-radius: 4px; font-weight: bold; cursor: pointer;" onclick="solicitarAprobacion('REHABILITAR')">
                    <i class="ri-arrow-go-back-line"></i> Solicitar Rehabilitación
                </button>
            `;
        } else {
            // CASO C: Normal (Pendiente o Completada). Mostramos botones normales.
            btnGuardar.style.display = 'block';
            btnGuardar.innerHTML = '<i class="ri-refresh-line"></i> Actualizar Orden';
            divBotonesEdicion.innerHTML = `
                <button class="btn" style="background-color: #10b981; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;" onclick="solicitarAprobacion('COMPLETADA')">
                    <i class="ri-check-double-line"></i> Orden Completada
                </button>
                <button class="btn" style="background-color: #ef4444; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;" onclick="solicitarAprobacion('ANULADA')">
                    <i class="ri-close-circle-line"></i> Anular Orden
                </button>
            `;
        }

        // 8. RECALCULAR MATEMÁTICAS Y CAMBIAR DE VISTA
        calcularTotales(); // Esto actualizará los subtotales, totales y automáticamente llama a actualizarSaldosPagos()
        cambiarVista('nueva-orden'); // Te lleva a la pantalla del formulario
        
    } catch (error) {
        console.error("Error cargando la orden:", error);
        alert("Hubo un error al intentar abrir esta Orden de Compra: " + error.message);
        const loader = document.getElementById('pantalla-carga');
        if (loader) loader.style.display = 'none';
    }
}
// ==========================================
// MÓDULO DE APROBACIONES Y AUDITORÍA
// ==========================================

async function solicitarAprobacion(tipoAccion) {
    if (!idOrdenActualEdicion) return alert("Error: No hay una orden seleccionada.");

    const sesionString = localStorage.getItem('sesion_activa');
    const usuarioActual = sesionString ? JSON.parse(sesionString) : null;
    const esAdmin = usuarioActual && usuarioActual.privilegio_id === 1;

    const accionTexto = tipoAccion === 'COMPLETADA' ? 'dar por COMPLETADA' : 
                        tipoAccion === 'ANULADA' ? 'ANULAR' : 'REHABILITAR';

    const mensajeConfirmacion = esAdmin 
        ? `🔐 Como Administrador: ¿Estás seguro de que deseas ${accionTexto} esta orden directamente?`
        : `¿Estás seguro de que deseas ${accionTexto} esta orden?\n\nPasará a estado de APROBACIÓN para que un Administrador la valide.`;

    if (confirm(mensajeConfirmacion)) {
        try {
            const estadoAGuardar = esAdmin ? (tipoAccion === 'REHABILITAR' ? 'PENDIENTE' : tipoAccion) : `APROBACIÓN_${tipoAccion}`;
            const timestampAhora = new Date().toISOString();
            
            let updateData = {
                estado: estadoAGuardar,
                solicitado_por: usuarioActual.nombre_completo,
                estado_aprobacion: 'PENDIENTE',
                fecha_solicitud_aprobacion: timestampAhora,
                fecha_ejecucion: null // Limpiamos por si es una solicitud nueva sobre una orden vieja
            };

            // ACCIÓN DIRECTA DEL ADMIN
            if (esAdmin) {
                const { data: orden } = await _supabase.from('ordenes').select('observacion').eq('id', idOrdenActualEdicion).single();
                const obsAnterior = (orden.observacion && orden.observacion.trim() !== '') ? orden.observacion.trim() + '\n' : '';
                const fechaHoy = new Date().toLocaleDateString('es-ES');
                
                let textoObs = '';
                if (tipoAccion === 'REHABILITAR') {
                    textoObs = `REHABILITADA en fecha ${fechaHoy}, solicitada por ${usuarioActual.nombre_completo}, aprobada por ${usuarioActual.nombre_completo}`;
                } else if (tipoAccion === 'ANULADA') {
                    textoObs = `ANULADA en fecha ${fechaHoy}, solicitada por ${usuarioActual.nombre_completo}, aprobada por ${usuarioActual.nombre_completo}`;
                } else {
                    textoObs = `COMPLETADA en fecha ${fechaHoy}, solicitada por ${usuarioActual.nombre_completo}, aprobada por ${usuarioActual.nombre_completo}`;
                }
                
                updateData.estado_aprobacion = 'APROBADA';
                updateData.aprobado_por = usuarioActual.nombre_completo;
                updateData.observacion = obsAnterior + textoObs;
                updateData.fecha_ejecucion = timestampAhora; // Registramos su ejecución inmediata
            }

            const { error } = await _supabase.from('ordenes').update(updateData).eq('id', idOrdenActualEdicion);
            if (error) throw error;

            alert(esAdmin ? `✅ Orden actualizada correctamente.` : `✅ Solicitud de ${accionTexto} enviada al administrador.`);
            cambiarVista('dashboard'); 
            
        } catch (error) {
            console.error("Error:", error);
            alert("Hubo un error al procesar la solicitud.");
        }
    }
}

async function cargarAprobaciones() {
    const tbody = document.getElementById('tabla-aprobaciones-body');
    if (!tbody) return;
    
    // Cambiamos el colspan a 7 por la nueva columna "Nº"
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px;">Cargando solicitudes... <i class="ri-loader-4-line ri-spin"></i></td></tr>';

    const sesionString = localStorage.getItem('sesion_activa');
    const usuarioActual = sesionString ? JSON.parse(sesionString) : null;
    const esAdmin = usuarioActual && usuarioActual.privilegio_id === 1;

    // ORDEN DE LLEGADA: ascending: true pone a los primeros que solicitaron arriba de la lista.
    let query = _supabase.from('ordenes')
        .select('*')
        .not('solicitado_por', 'is', null)
        .order('fecha_solicitud_aprobacion', { ascending: true }); 

    if (!esAdmin) {
        query = query.eq('solicitado_por', usuarioActual.nombre_completo);
    }

    const { data: ordenes, error } = await query;

    if (error || !ordenes || ordenes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 20px;">No hay solicitudes registradas.</td></tr>`;
        return;
    }

    const formatearFechaHora = (isoString) => {
        if (!isoString) return '-';
        const d = new Date(isoString);
        return `${d.toLocaleDateString('es-ES')}<br><span style="font-size: 11px; color: #94a3b8;"><i class="ri-time-line"></i> ${d.toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}</span>`;
    };

    // Usamos el index del .map() para crear el número de llegada
    tbody.innerHTML = ordenes.map((orden, index) => {
        const numLlegada = index + 1; 
        const fechaReq = formatearFechaHora(orden.fecha_solicitud_aprobacion);
        const fechaEjec = formatearFechaHora(orden.fecha_ejecucion);
        
        let accionSolicitada = '';
        if (orden.estado.includes('COMPLETADA')) accionSolicitada = 'COMPLETADA';
        else if (orden.estado.includes('ANULADA')) accionSolicitada = 'ANULADA';
        else if (orden.estado.includes('REHABILITAR') || (orden.estado === 'PENDIENTE' && orden.estado_aprobacion !== 'PENDIENTE')) accionSolicitada = 'REHABILITAR';
        else accionSolicitada = orden.estado.replace('APROBACIÓN_', '');

        let badgeStyle = '';
        let estadoTxt = '';
        let accionesHTML = '';

        if (orden.estado_aprobacion === 'PENDIENTE') {
            badgeStyle = 'background-color: #fef08a; color: #854d0e;';
            estadoTxt = `SOLICITA ${accionSolicitada}`;
            
            if (esAdmin) {
                accionesHTML = `
                    <div style="display: flex; gap: 8px; justify-content: center; align-items: center; width: 100%;">
                        <button class="btn btn-sm" style="background-color: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;" onclick="resolverAprobacion('${orden.id}', '${accionSolicitada}', true)">
                            Aprobar
                        </button>
                        <button class="btn btn-sm" style="background-color: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;" onclick="resolverAprobacion('${orden.id}', '${accionSolicitada}', false)">
                            Rechazar
                        </button>
                    </div>
                `;
            } else {
                accionesHTML = `<div style="color: #854d0e; font-size: 12px; font-weight: bold; text-align: center;"><i class="ri-time-line"></i> Pendiente de Admin</div>`;
            }
        } else if (orden.estado_aprobacion === 'APROBADA') {
            badgeStyle = 'background-color: #dcfce3; color: #166534;';
            estadoTxt = `ORDEN ${accionSolicitada}`; // <--- CAMBIO AQUÍ
            accionesHTML = `<div style="text-align: center; font-size: 12px; color: #166534; font-weight: bold;">APROBADA<br><span style="font-weight: normal; font-size: 11px;">Por: ${orden.aprobado_por}</span></div>`;
        } else if (orden.estado_aprobacion === 'RECHAZADA') {
            badgeStyle = 'background-color: #fee2e2; color: #991b1b;';
            estadoTxt = `SOLICITUD RECHAZADA`; // <--- CAMBIO AQUÍ
            accionesHTML = `<div style="text-align: center; font-size: 12px; color: #991b1b; font-weight: bold;">RECHAZADA<br><span style="font-weight: normal; font-size: 11px;">Por: ${orden.aprobado_por}</span></div>`;
        }

        let badge = `<span style="${badgeStyle} padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; text-align: center; display: inline-block;">${estadoTxt}</span>`;

        return `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-weight: bold; color: #64748b; vertical-align: middle; text-align: center;">${numLlegada}</td>
                <td style="padding: 12px 16px; font-weight: bold; color: #334155; vertical-align: middle;">${orden.numero_oc || '-'}</td>
                <td style="padding: 12px 16px; color: #475569; vertical-align: middle;">
                    ${orden.proveedor_nombre || '-'}<br>
                    <span style="font-size: 11px; color: #94a3b8;"><i class="ri-user-line"></i> Req: ${orden.solicitado_por}</span>
                </td>
                <td style="padding: 12px 16px; color: #475569; vertical-align: middle; text-align: center;">${fechaReq}</td>
                <td style="padding: 12px 16px; text-align: center; vertical-align: middle;">${badge}</td>
                <td style="padding: 12px 16px; color: #475569; vertical-align: middle; text-align: center;">${fechaEjec}</td>
                <td style="padding: 12px 16px; text-align: center; vertical-align: middle;">${accionesHTML}</td>
            </tr>
        `;
    }).join('');
}

window.resolverAprobacion = async function(idOrden, accionSolicitada, aprueba) {
    const msj = aprueba 
        ? `¿Estás seguro de APROBAR esta solicitud y marcar la orden como ${accionSolicitada}?`
        : `¿Estás seguro de RECHAZAR esta solicitud?`;

    if (!confirm(msj)) return;

    const sesionString = localStorage.getItem('sesion_activa');
    const usuarioActual = sesionString ? JSON.parse(sesionString) : null;
    const nombreAdmin = usuarioActual ? usuarioActual.nombre_completo : 'Admin';
    const timestampAhora = new Date().toISOString(); // Hora exacta en que el admin hace clic

    try {
        const { data: orden } = await _supabase.from('ordenes').select('observacion, solicitado_por').eq('id', idOrden).single();
        const obsAnterior = (orden.observacion && orden.observacion.trim() !== '') ? orden.observacion.trim() + '\n' : '';
        const fechaHoy = new Date().toLocaleDateString('es-ES');
        
        let nuevoEstado = '';
        let textoObs = '';

        if (aprueba) {
            if (accionSolicitada === 'ANULADA') nuevoEstado = 'ANULADA';
            if (accionSolicitada === 'COMPLETADA') nuevoEstado = 'COMPLETADA';
            if (accionSolicitada === 'REHABILITAR') nuevoEstado = 'PENDIENTE';

            if (accionSolicitada === 'REHABILITAR') {
                textoObs = `REHABILITADA en fecha ${fechaHoy}, solicitada por ${orden.solicitado_por}, aprobada por ${nombreAdmin}`;
            } else if (accionSolicitada === 'ANULADA') {
                textoObs = `ANULADA en fecha ${fechaHoy}, solicitada por ${orden.solicitado_por}, aprobada por ${nombreAdmin}`;
            } else {
                textoObs = `COMPLETADA en fecha ${fechaHoy}, solicitada por ${orden.solicitado_por}, aprobada por ${nombreAdmin}`;
            }

        } else {
            if (accionSolicitada === 'REHABILITAR') nuevoEstado = 'ANULADA'; 
            else nuevoEstado = 'PENDIENTE';

            textoObs = `RECHAZADA (Solicitud de ${accionSolicitada}) en fecha ${fechaHoy}, solicitada por ${orden.solicitado_por}, rechazada por ${nombreAdmin}`;
        }

        const updateData = {
            estado: nuevoEstado,
            estado_aprobacion: aprueba ? 'APROBADA' : 'RECHAZADA',
            aprobado_por: nombreAdmin,
            fecha_ejecucion: timestampAhora, // Guardamos la hora de ejecución
            observacion: obsAnterior + textoObs
        };

        const { error } = await _supabase.from('ordenes').update(updateData).eq('id', idOrden);
        if (error) throw error;

        alert('✅ Solicitud procesada correctamente. Se actualizó la observación de la orden.');
        cargarAprobaciones(); 
        
    } catch (error) {
        console.error("Error:", error);
        alert("❌ Ocurrió un error al intentar procesar la orden.");
    }
}
