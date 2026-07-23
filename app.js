// ==========================================
// 1. CONFIGURACIÓN Y CONSTANTES
// ==========================================
const SUPABASE_URL = 'https://ijoclanarnmlbajefcpx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlqb2NsYW5hcm5tbGJhamVmY3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3Mjg5NzYsImV4cCI6MjEwMDMwNDk3Nn0.KMFLOyp_CDQLEpnMQDxRh3t99BHst8nXseaMxu-SF_g';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const MAX_INTENTOS = 5;
const TIEMPO_BLOQUEO_MINUTOS = 5;

// ==========================================
// 2. INICIALIZACIÓN DE LA APLICACIÓN
// ==========================================
window.onload = () => {
    verificarSesionPrevia();
    configurarOjoPassword();
    cargarListaPrivilegios(); // <-- CORRECCIÓN: Ahora la app descarga los roles al iniciar
    
    // Generar las 3 filas por defecto para Órdenes de Compra
    for (let i = 0; i < 3; i++) agregarFilaItem();
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

    const { data: clientes, error } = await _supabase.from('clientes').select('*, contactos_cliente(nombre_completo)').order('created_at', { ascending: false });
    
    if (error || !clientes || clientes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center ${error ? 'text-danger' : ''}">${error ? 'Error al cargar.' : 'No hay clientes registrados.'}</td></tr>`;
        return;
    }

    tbody.innerHTML = clientes.map(c => `
        <tr>
            <td>${c.nit_ci || 'S/N'}</td>
            <td><strong>${c.razon_social}</strong></td>
            <td>${c.contactos_cliente?.[0]?.nombre_completo || '-'}</td>
            <td>${c.telefono || '-'}</td>
            <td>${c.direccion || '-'}</td>
            <td><span class="badge ${c.activo ? 'badge-success' : 'text-danger'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td><button class="btn-icon" title="Editar"><i class="ri-edit-line"></i></button></td>
        </tr>
    `).join('');
}

async function guardarNuevoCliente(event) {
    if (event) event.preventDefault();
    const nit_ci = document.getElementById('cliente-nit').value;
    const razon_social = document.getElementById('cliente-razon').value;
    if (!razon_social) return alert('Por favor ingrese la Razón Social o Nombre de la Empresa.');

    const { data: clienteData, error: errorCliente } = await _supabase.from('clientes').insert([{ 
        nit_ci, razon_social, 
        telefono: document.getElementById('cliente-telefono').value, 
        direccion: document.getElementById('cliente-direccion').value, 
        activo: true
    }]).select(); 

    if (errorCliente) return alert('Error al registrar la empresa: ' + errorCliente.message);

    const nombre_completo = document.getElementById('cliente-contacto').value;
    if (clienteData?.length > 0 && nombre_completo) {
        await _supabase.from('contactos_cliente').insert([{ 
            cliente_id: clienteData[0].id, nombre_completo,
            telefono: document.getElementById('cliente-telefono').value,
            correo: document.getElementById('cliente-correo')?.value || ''
        }]);
    }
    alert('Cliente registrado con éxito.');
    cerrarModal('modal-nuevo-cliente');
    document.getElementById('form-nuevo-cliente')?.reset();
    cargarClientes(); 
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
