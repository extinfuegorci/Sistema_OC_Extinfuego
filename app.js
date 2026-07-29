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
    cargarDashboard();
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
            'bitacora': 'Bitácora de Auditoría'
        };
        
        const elemTitulo = document.getElementById('titulo-seccion');
        if (elemTitulo) elemTitulo.innerText = titulos[idVista] || 'Sistema OC';

        if (idVista === 'clientes') cargarClientes();
        if (idVista === 'usuarios') cargarUsuarios();
        if (idVista === 'dashboard') cargarDashboard();

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

        // 2. Validaciones obligatorias
        if (!tipoCodigoId || !numeroOc) return alert('⚠️ Por favor, haz clic en OC Nº y selecciona un código.');
        if (!proveedor) return alert('⚠️ Por favor, ingresa el nombre del proveedor.');
        if (!fechaSolicitud) return alert('⚠️ Por favor, selecciona la fecha de solicitud.');
        if (!formaPago) return alert('⚠️ Por favor, selecciona una forma de pago.');
        if (total <= 0) return alert('⚠️ El total debe ser mayor a 0.');

        // 3. (Omitido temporalmente: Verificación de usuario)
        
        // 4. Inserción en la tabla principal (ordenes)
        const nuevaOrden = {
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
            estado: 'PENDIENTE', 
            monto_pagado: montoPagadoFinal, // El trigger lo sobreescribirá de todos modos, pero es buena práctica enviarlo
            fecha_vencimiento: fechaVencimientoFinal,
            porcentaje_anticipo: porcentajeAnticipoFinal
        };

        const { data: ordenInsertada, error: errorOrden } = await _supabase
            .from('ordenes')
            .insert([nuevaOrden])
            .select(); 

        if (errorOrden) throw new Error('Error al guardar la orden: ' + errorOrden.message);
        
        const idOrdenGenerada = ordenInsertada[0].id;

        // 5. Inserción de los Ítems (Detalle)
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
        } else {
            alert('⚠️ La orden se guardó sin productos en el detalle.');
        }

        // =================================================================
        // 5.5 NUEVO: INSERCIÓN AUTOMÁTICA EN EL HISTORIAL DE PAGOS
        // =================================================================
        if ((formaPago === 'ANTICIPO' || formaPago === 'CONTADO') && montoPagadoFinal > 0) {
            // Nota: Si es al contado, también registramos el pago total como recibo para que quede constancia
            const identificadorRecibo = formaPago === 'CONTADO' ? 'PAGO-CONTADO' : 'ANTICIPO-INICIAL';
            
            const pagoInicial = {
                orden_id: idOrdenGenerada,
                numero_recibo: identificadorRecibo,
                monto: montoPagadoFinal,
                fecha_pago: fechaSolicitud // Usamos la misma fecha de creación de la OC
            };

            const { error: errorPago } = await _supabase
                .from('historial_pagos')
                .insert([pagoInicial]);

            if (errorPago) {
                console.error("Error al registrar el pago inicial en el historial:", errorPago);
                // No detenemos el proceso con throw, solo avisamos
                alert("⚠️ La orden se creó, pero hubo un problema guardando el recibo inicial en el historial.");
            }
        }
        // =================================================================

        // 6. ACTUALIZAR EL CORRELATIVO DEL CÓDIGO
        const nuevoCorrelativo = parseInt(correlativoActual) + 1;
        const { error: errorUpdateCodigo } = await _supabase
            .from('tipos_codificacion')
            .update({ correlativo: nuevoCorrelativo })
            .eq('id', tipoCodigoId);

        if (errorUpdateCodigo) {
            console.error("Error actualizando correlativo:", errorUpdateCodigo);
            alert("⚠️ Error al actualizar el número correlativo.");
        }

        // 7. Éxito y limpieza
        alert('✅ ¡Orden de Compra registrada con éxito!');
        
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
        const tbody = document.getElementById('tabla-dashboard-body');
        
        // 1. Mostrar mensaje de carga
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Cargando información... <i class="ri-loader-4-line ri-spin"></i></td></tr>';

        // 2. Consultar a Supabase (Solo necesitamos la tabla 'ordenes' porque ahí ya guardas proveedor_nombre y empresa_solicitante)
        const { data: ordenes, error } = await _supabase
            .from('ordenes')
            .select('*')
            .order('fecha_solicitud', { ascending: false });

        if (error) throw error;

        // 3. Variables para las métricas
        let totalGastado = 0;
        let totalPagado = 0;
        let totalPendiente = 0;

        if (tbody) tbody.innerHTML = '';

        if (ordenes.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No hay órdenes registradas aún.</td></tr>';
        }

        // 4. Recorrer cada orden
        ordenes.forEach(orden => {
            const monto = parseFloat(orden.monto_total) || 0;
            totalGastado += monto;
            
            // Evaluamos según el estado de la orden
            if (orden.estado === 'APROBADO' || orden.estado === 'PAGADO') {
                totalPagado += monto;
            } else if (orden.estado === 'PENDIENTE' || orden.estado === 'EMITIDO') {
                totalPendiente += monto;
            }

            // Construir la fila
            const tr = document.createElement('tr');
            
            let colorEstado = '#f59e0b'; // Naranja para pendiente
            if (orden.estado === 'APROBADO') colorEstado = '#10b981'; // Verde
            if (orden.estado === 'SOLICITUD_ANULACION') colorEstado = '#ef4444'; // Rojo

            // Formatear fechas (Manejo de nulos por si no hay fecha de entrega)
            const fechaIngreso = orden.fecha_solicitud ? new Date(orden.fecha_solicitud).toLocaleDateString() : '-';
            const fechaEntrega = orden.fecha_entrega ? new Date(orden.fecha_entrega).toLocaleDateString() : '-';

            tr.innerHTML = `
                <td><strong>${orden.numero_oc || '-'}</strong></td>
                <td>${orden.proveedor_nombre || '-'}</td>
                <td>${orden.empresa_solicitante || '-'}</td>
                <td>${fechaIngreso}</td>
                <td>${fechaEntrega}</td>
                <td><strong>Bs. ${monto.toFixed(2)}</strong></td>
                <td>
                    <span style="background-color: ${colorEstado}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;">
                        ${orden.estado || 'PENDIENTE'}
                    </span>
                </td>
                <td>
                    <button class="btn-icon" onclick="console.log('Ver detalle ${orden.id}')" title="Ver Detalles">
                        <i class="ri-eye-line"></i>
                    </button>
                </td>
            `;
            if (tbody) tbody.appendChild(tr);
        });

        // 5. Actualizar tarjetas del HTML
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
