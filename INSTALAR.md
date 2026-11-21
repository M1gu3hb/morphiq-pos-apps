# Instalar POS Don Poncho en cada aparato

Para Miguel, el día de la instalación. Sin contraseñas aquí: la del laboratorio de hardware la
tecleas tú; los PIN del personal están en `_PRIVADO`.

Las apps abren **el POS de producción** a pantalla completa, imprimen directo (sin el diálogo del
navegador), abren el cajón y se actualizan solas. Todo lo demás vive en la web.

- **Descargas:** en el navegador del aparato, teclea **don-poncho-apps.vercel.app** y toca el botón
  resaltado (siempre trae la versión más nueva). Para un teléfono, escanea el QR de esa página.
  También: <https://github.com/M1gu3hb/morphiq-pos-apps/releases>
- Copia local: `D:\MIS PROYECTOS\MORPHIQ POS\Apps\`

## 1 · Windows (`POS-Don-Poncho-Setup-x.y.z.exe`)

1. Copia el instalador al POS (USB o descárgalo ahí) y ábrelo.
2. **«Windows protegió su PC»:** sale la primera vez porque el instalador no lleva firma de código.
   Toca **«Más información»** y luego **«Ejecutar de todas formas»**.
3. Se instala sola para ese usuario de Windows (no pide administrador) y deja el acceso directo
   «POS Don Poncho» en el escritorio. Al terminar se abre.
4. **La primera vez abre «Diagnóstico de este aparato».** Tómale una captura (o «Copiar
   diagnóstico») y mándamela: con eso se decide cómo imprime ese POS. Luego **«Abrir el POS»**.
5. Desde entonces abre directo el POS, a pantalla completa, y arranca sola con Windows.

**Atajos del dueño** (la app no tiene barra de menú):

| Teclas | Qué hace |
| --- | --- |
| `Ctrl` + `Shift` + `M` | El menú de la app: Diagnóstico · Buscar actualización · Pantalla completa sí/no · Recargar · Acerca de · Salir |
| `Ctrl` + `Shift` + `Q` | Salir de la app |

**Windows 7 u 8:** el instalador normal no corre ahí. Avísame: hay una variante con Electron 22 (la
última que corre en esos Windows), que **ya no recibe parches de seguridad** y trae un navegador
viejo en el que el POS puede no verse bien. Si el equipo aguanta, lo mejor es pasarlo a Windows 10.
Para saber qué equipo es sin instalar nada, corre `diagnostico-windows.bat` (viene en el release) y
mándame el archivo que deja en el escritorio.

## 2 · Android (`POS-Don-Poncho-x.y.z.apk`)

Necesita Android 6 o más nuevo.

1. Copia el APK al aparato (USB, o descárgalo en su navegador) y tócalo.
2. **«Apps desconocidas»:** Android pregunta si dejas instalar apps a ese navegador o a ese
   administrador de archivos. Toca **«Ajustes»**, enciende **«Permitir desde esta fuente»**, vuelve
   atrás y toca **«Instalar»**.
3. Abre «POS Don Poncho». **La primera vez abre «Diagnóstico de este aparato»:** captura y mándamela.
   Luego **«Abrir el POS»**.
4. Para volver al Diagnóstico después: **mantén presionado el ícono** de la app → «Diagnóstico».

**Impresora por USB:** al conectarla (o al tocar «Dar permiso» en Diagnóstico) Android pregunta
«¿Permitir que POS Don Poncho acceda al dispositivo USB?». Marca **«Usar siempre»** y acepta.

**Si el aparato (iMin) vuelve a pedir el permiso cada que se prende** (prueba de 5 minutos, APK nueva con el filtro USB):
1. Conecta la impresora y, en la Caja, imprime algo: si falta el permiso sale «Dar permiso a la impresora».
2. Tócalo. En el diálogo de Android marca **«Usar de forma predeterminada para este dispositivo USB»** y acepta. Si esa casilla NO aparece, la impresora no cuadra con el filtro (`res/xml/dispositivos_usb.xml`): anota su vendor y product de Diagnóstico y avísame.
3. Reinicia el aparato (apágalo y préndelo) y vuelve a imprimir. Si imprime sin preguntar, quedó. Si pide el permiso otra vez, Android no vuelve a «conectar» esa impresora al arrancar: se queda el botón «Dar permiso a la impresora» del aviso (un toque).
4. Desinstalar la app o «Borrar datos» borra el permiso recordado; reinstalar obliga a repetir el paso 2.

**Impresora por Bluetooth** (también la integrada de los POS tipo Sunmi, «InnerPrinter»):

1. Ajustes de Android → Bluetooth → enciéndelo y **empareja** la impresora (el código suele ser
   `0000` o `1234`; la «InnerPrinter» casi siempre ya viene emparejada).
2. En la app, la primera vez pide el permiso de **«dispositivos cercanos»**: acéptalo.
3. Vuelve a Diagnóstico y toca «Volver a leer»: la impresora aparece en la lista.

### Los POS con Android viejo (iMin D4-503 y parecidos)

Estos aparatos traen Android 7 y un «motor de pantalla» (WebView) que **no se puede actualizar**:
instalar «Android System WebView» o Chrome no lo cambia. No hace falta: el POS trae un **modo
compatible** y se ve igual que en un aparato nuevo. La app lo avisa una sola vez («Este aparato usa
un motor antiguo…») y en Diagnóstico → **«Probar compatibilidad»** sale la lista de lo que el motor
entiende. Si dijera **«Este aparato es demasiado viejo para el POS»**, ese aparato no sirve.

Antes de dejarlo en el mostrador, en los Ajustes de Android del aparato:

1. **Fecha y hora automáticas** (Ajustes → Fecha y hora → «Fecha y hora automáticas» y «Zona
   horaria automática»). Es lo más importante: con la fecha desfasada el aparato rechaza la
   conexión segura y el POS no abre («Sin conexión»), aunque haya internet.
2. **Que la pantalla no se suspenda** (Ajustes → Pantalla → Suspender: «Nunca» o el máximo). El
   POS mantiene la pantalla encendida mientras está abierto, pero el ajuste evita que se apague en
   el Diagnóstico o al cambiar de app.
3. **Las actualizaciones del sistema de iMin, fuera del horario de servicio**: si el aparato ofrece
   una actualización, pospónla y hazla con el restaurante cerrado. A media operación reinicia el
   aparato.
4. **Opcional — la app como pantalla de inicio** (desde la 1.0.1): en la app, Diagnóstico → **«Usar
   como pantalla de inicio»**. Después toca el botón de inicio del aparato: Android pregunta qué
   usar; elige «POS Don Poncho» y «Siempre». El personal ya no puede salirse del POS con ese botón.
   Para volver al escritorio de Android: Diagnóstico (mantén presionado el ícono, o el aviso del
   primer arranque) → «Dejar de usar como pantalla de inicio».

**Actualizar la app (de la 1.0.0 en adelante):** al abrir la app con una versión nueva publicada
aparece el aviso; toca **«Instalar»**. La primera vez Android 7 pide encender «Orígenes
desconocidos» (Ajustes → Seguridad). **El perfil de impresión que ya guardaste se conserva**: no
hay que volver a configurar la impresora ni el cajón.

Los **teléfonos viejos del personal** (meseros, cocina) abren el POS en su navegador y reciben el
mismo modo compatible; no hay que instalarles nada.

## 3 · Dejar lista la impresión (el laboratorio)

En el POS, entra como dueño o administrador:

1. **Configuración → Operación**, hasta abajo: **«Hardware y pruebas de impresión»**.
2. Dice «Sólo tu proveedor MORPHIQ puede entrar aquí»: teclea la contraseña del proveedor. El
   permiso dura 30 minutos en ese aparato y sólo le sirve a quien tenía la sesión abierta (si
   entra otra persona con su PIN, hay que teclearla otra vez). Cinco fallos y hay que esperar 15
   minutos.
   - Si en lugar de pedirla dice **«Este laboratorio todavía no tiene contraseña»**, el POS no
     encontró la variable `PROVEEDOR_CLAVE_HASH` en Vercel (Production) o le llegó incompleta: no
     sigas probando contraseñas; se arregla en Vercel y con un despliegue nuevo. Mientras tanto la
     Caja imprime con el navegador, como siempre.
3. **Elige la conexión y la impresora** (las que ese aparato no puede aparecen apagadas y dicen por
   qué). Para una de red, su IP y el puerto 9100.
4. **«Página de prueba».** Si sale, la conexión sirve.
5. **«Regla de calibración».** En el papel, mira hasta qué número llega la regla completa: 384 (58 mm),
   512 o 576 (80 mm). Pon ese número en «Puntos». El cuadro debe medir 10 × 10 mm; si mide más, la
   impresora es de 180 dpi.
6. **«Vista previa de impresión»:** enseña, sin gastar papel, la imagen exacta que va a salir junto
   al ticket de la pantalla.
7. **«Ticket de ejemplo»** (no crea ninguna venta). Debe salir igual que en la pantalla, con acentos
   y ñ. Si el corte se come el final, sube «Líneas antes del corte». Si la impresora se atora o
   escupe basura, baja «Filas por franja» y el «Bloque», o sube la «Pausa».
8. **El cajón:** enciende «Este aparato tiene cajón», prueba el pin 2 y, si no abre, el 5.
9. **«Guardar como perfil de este aparato».** Desde ahí el personal ve en Configuración → Impresión
   «Impresora lista ✓», y la Caja imprime directo.
10. **Otro POS igual:** «Exportar» el perfil (un archivo `.json`), llévalo al otro aparato, entra a su
    laboratorio y «Importar».

Lo que ve el personal (Configuración → Impresión): el estado, «Página de prueba» y «Abrir cajón». No
pueden cambiar el perfil.

## 4 · La lista corta por POS

Marca cada una en cada aparato:

1. Instalar.
2. Abrir (sale Diagnóstico; captura).
3. Entrar con PIN.
4. Página de prueba.
5. Ticket de ejemplo (sale igual que en la pantalla).
6. Abrir el cajón.
7. Cortar el internet (sale «Sin internet, reintentando…») y volver (regresa solo al POS).
8. Reiniciar el POS: en Windows la app arranca sola.
9. Actualizar: cuando haya versión nueva, llega el aviso «POS Don Poncho tiene una actualización».
   En Windows se instala sola al cerrar (o «Reiniciar ahora»); en Android hay que tocar «Actualizar»
   y luego «Instalar» (Android no deja instalar a escondidas).

## 5 · Si algo falla

| Qué pasa | Qué hacer |
| --- | --- |
| «Sin papel», «Tapa abierta», «Impresora desconectada» | Arréglalo en la impresora y toca «Reintentar»: sale el mismo ticket, no uno repetido. |
| «No respondió en 10 s» | Revisa el cable o el Bluetooth. Mientras, «Imprimir con el navegador». |
| El ticket sale con letras raras o basura | La impresora no entiende esa forma de imprimir: en el laboratorio prueba «por columnas (ESC \*)» o, en Windows, «driver de Windows». |
| El ticket sale cortado a la derecha | «Puntos» es más grande que lo que imprime esa impresora: vuelve a la regla de calibración. |
| El cajón no abre | Pin 2 ↔ 5 en el laboratorio; revisa que el cable del cajón vaya a la impresora. |
| En Windows dice «fuera de línea» y no imprime aunque sí está conectada | Algunos drivers lo dicen mal. Avísame: se apaga esa revisión para ese aparato. |
| «La impresora de red se indica con su dirección IP completa…» o «Sólo se imprime en red hacia direcciones de tu red local» (desde la 1.0.1) | En el laboratorio, escribe la **IP** de la impresora (por ejemplo `192.168.1.50`), no su nombre. Una impresora de red siempre está en la red del negocio. |
| En Windows: «La impresora «…» no está instalada en este equipo» (desde la 1.0.1) | Instálala en Windows (Configuración → Impresoras) o elige otra de la lista del laboratorio. La app sólo imprime en las que Windows tiene instaladas. |
| En el POS con Android el POS no abre y dice «Sin conexión», pero sí hay internet | Revisa la **fecha y la hora** del aparato (deben estar en automático). Con la fecha mal, el aparato rechaza la conexión segura. |
| En Windows el PDF del corte no aparece en `Documentos\POS Don Poncho\Cortes\AAAA-MM\` (desde la 1.0.2) | Los cortes se guardan solos ahí al cerrar la caja. Si el POS avisó que no se pudo (por ejemplo, el archivo está abierto en otro programa), ciérralo y toca «Guardar en la carpeta» en Registros → Cortes. «Abrir carpeta» la abre en el Explorador. Con la 1.0.1 el PDF se baja como en un navegador. |
| La app no abre el POS | «Sin internet, reintentando…» vuelve sola. Si no, `Ctrl`+`Shift`+`M` → Recargar. |
| No imprime nada directo | Siempre queda el navegador: el botón «Imprimir con el navegador» abre el diálogo de siempre. |
| Reimprimir sin internet | En la pantalla «Sin internet»: «Reimprimir el último ticket» (sale marcado como reimpresión). |

Un error de impresión **nunca deshace el cobro**: la venta ya quedó; lo que falta es el papel.

## 6 · Las llaves

El keystore de Android y su archivo de firma están en `D:\MIS PROYECTOS\MORPHIQ POS\_PRIVADO\apps\`.
**Respáldalos fuera de la laptop (USB o Drive).** Si se pierde el keystore, la APK ya no se puede
actualizar: habría que desinstalarla y reinstalarla a mano en cada POS.
