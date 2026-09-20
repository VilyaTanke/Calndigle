# 📅 Calendario Interactivo de Reservas

Aplicación web estática para gestionar inscripciones en fechas y horarios específicos. Publicable en **GitHub Pages** con datos en tiempo real vía **Firebase Firestore**.

---

## 🗂 Estructura del proyecto

```
├── index.html          ← Vista pública: calendario de reservas
├── reservas.html       ← Vista pública: todas las reservas (tiempo real)
├── admin.html          ← Panel de administración (requiere login)
├── css/
│   ├── style.css       ← Estilos globales
│   └── calendar.css    ← Estilos del calendario
├── js/
│   ├── firebase-config.js   ← ⚠️ Configura aquí Firebase
│   ├── calendar.js          ← Lógica del calendario
│   ├── reservas.js          ← Lógica de la vista de reservas
│   └── admin.js             ← Lógica del panel admin
└── README.md
```

---

## 🚀 Configuración paso a paso

### Paso 1 — Crear proyecto en Firebase

1. Ve a **[firebase.google.com](https://firebase.google.com)** e inicia sesión con tu cuenta Google
2. Haz clic en **"Añadir proyecto"**
3. Pon un nombre (p.ej. `mi-calendario`) y sigue el asistente
4. Una vez creado, en la pantalla principal haz clic en el icono **`</>`** (Web) para añadir una app web
5. Dale un nombre a la app y haz clic en **"Registrar app"**
6. **Copia la configuración** que aparece (`firebaseConfig`):

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "mi-calendario.firebaseapp.com",
  projectId: "mi-calendario",
  storageBucket: "mi-calendario.appspot.com",
  messagingSenderId: "123456...",
  appId: "1:123456:web:abc..."
};
```

7. Abre el archivo `js/firebase-config.js` y reemplaza los valores de ejemplo con los tuyos

---

### Paso 2 — Configurar Firestore (base de datos)

1. En Firebase Console, ve al menú lateral → **Firestore Database**
2. Haz clic en **"Crear base de datos"**
3. Selecciona **"Iniciar en modo de prueba"** (temporal, lo ajustaremos)
4. Elige la ubicación más cercana (p.ej. `europe-west1`)
5. Haz clic en **"Habilitar"**

#### Reglas de seguridad de Firestore

En Firebase Console → Firestore → **Reglas**, pega lo siguiente y haz clic en **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Configuración: solo admins pueden escribir
    match /settings/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Fechas disponibles: solo admins pueden crear/editar/borrar
    match /fechas/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Reservas: cualquiera puede crear, solo admin puede borrar
    match /reservas/{doc} {
      allow read: if true;
      allow create: if true;
      allow delete, update: if request.auth != null;
    }
  }
}
```

---

### Paso 3 — Crear cuenta de administrador

1. En Firebase Console → menú lateral → **Authentication**
2. Haz clic en **"Comenzar"**
3. En la pestaña **"Métodos de acceso"**, habilita **"Correo electrónico/Contraseña"**
4. Ve a la pestaña **"Usuarios"** y haz clic en **"Añadir usuario"**
5. Introduce tu email y contraseña de administrador
6. ¡Guarda bien estas credenciales! Las usarás para acceder a `admin.html`

---

### Paso 4 — Crear repositorio en GitHub y publicar

1. Ve a **[github.com](https://github.com)** e inicia sesión
2. Haz clic en **"New repository"**
   - Nombre: `calendario` (o el que prefieras)
   - Visibilidad: **Public** (necesario para GitHub Pages gratuito)
   - No inicialices con README (ya lo tenemos)
3. Sigue las instrucciones de GitHub para subir el código local:

```bash
git init
git add .
git commit -m "Primer commit: calendario interactivo"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/calendario.git
git push -u origin main
```

4. En tu repositorio de GitHub, ve a **Settings → Pages**
5. En **"Source"**, selecciona **"Deploy from a branch"**
6. Branch: `main`, carpeta: `/ (root)`
7. Haz clic en **"Save"**

Tu calendario estará disponible en:
```
https://TU_USUARIO.github.io/calendario/
```

*(Puede tardar 1-2 minutos en estar activo)*

---

## 🔗 URLs de la aplicación

| Página | URL |
|---|---|
| Calendario (reservar) | `https://TU_USUARIO.github.io/calendario/` |
| Ver todas las reservas | `https://TU_USUARIO.github.io/calendario/reservas.html` |
| Panel de administración | `https://TU_USUARIO.github.io/calendario/admin.html` |

---

## 🛠 Uso del panel de administración

### Gestionar fechas y horarios

1. Abre `admin.html` e inicia sesión con las credenciales de Firebase Auth
2. En la pestaña **"Fechas y Horarios"**, usa el formulario para añadir fechas
3. Para los horarios puedes usar:
   - Lista separada por comas: `09:00, 10:00, 11:00, 12:00`
   - Rango automático: `09:00-13:00` (genera 9, 10, 11, 12, 13h)
   - O selecciona uno de los presets rápidos

### Gestionar reservas

- En la pestaña **"Reservas"** puedes ver todas las inscripciones
- Puedes eliminar cualquier reserva si es necesario

### Configuración

- Cambia el título y descripción del calendario desde la pestaña **"Configuración"**

---

## ✨ Funcionalidades

- **Calendario mensual** con navegación entre meses
- **Slots de tiempo** bloqueados en tiempo real cuando alguien los reserva
- **Selección múltiple**: un participante puede reservar varias horas a la vez
- **Nombre visible**: cada slot muestra el nombre del participante
- **Vista de reservas** con filtro por nombre y fecha
- **Panel admin** protegido con Firebase Authentication
- **Actualización en tiempo real** vía Firestore `onSnapshot`
- **Diseño responsive** para móvil y escritorio

---

## 🔧 Personalización

### Colores y estilos
Edita las variables CSS en `css/style.css` (sección `:root`) para cambiar el esquema de colores.

### Dominio personalizado
Si tienes un dominio propio, puedes configurarlo en GitHub Pages → Custom domain.

---

## 📋 Solución de problemas

| Problema | Solución |
|---|---|
| Aparece banner naranja de advertencia | Configura `js/firebase-config.js` con tus credenciales reales |
| Error "permission-denied" en consola | Revisa las reglas de Firestore (Paso 2) |
| No puedo iniciar sesión en admin | Verifica que Authentication esté habilitado y el usuario creado (Paso 3) |
| La página no carga en GitHub Pages | Asegúrate de que el repositorio sea público y Pages esté configurado en `main/root` |
| Los datos no se actualizan | Comprueba la conexión y las reglas de Firestore |
