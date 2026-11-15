package mx.morphiq.pos.app

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.BridgeActivity
import mx.morphiq.pos.app.actualizacion.PantallaDeActualizacion
import mx.morphiq.pos.app.logica.AjustesMezcla
import mx.morphiq.pos.app.logica.InfoDeActualizacion
import mx.morphiq.pos.app.logica.ModoDelPuente
import mx.morphiq.pos.app.logica.OrigenPermitido
import mx.morphiq.pos.app.puente.Avisos
import mx.morphiq.pos.app.puente.ClienteWebMorphiq
import mx.morphiq.pos.app.puente.InyeccionDelPuente
import mx.morphiq.pos.app.puente.MorphiqAppPlugin
import mx.morphiq.pos.app.puente.PermisosConAviso
import mx.morphiq.pos.app.puente.ServiciosDeLaApp
import org.json.JSONObject

/**
 * La única pantalla de la app: un WebView a pantalla completa que abre el POS de producción del
 * cliente (o, el primer arranque, Diagnóstico). Siempre encendida, inmersiva, y el botón Atrás no
 * la cierra por accidente.
 */
class MainActivity : BridgeActivity(), PantallaDeActualizacion {

    val servicios: ServiciosDeLaApp by lazy { ServiciosDeLaApp(applicationContext) }
    /** Se crea en onCreate: el registro del permiso de Bluetooth debe existir antes de que la actividad arranque. */
    lateinit var permisos: PermisosConAviso
        private set

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(MorphiqAppPlugin::class.java)
        super.onCreate(savedInstanceState)
        permisos = PermisosConAviso(this, servicios.permisoUsb)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES }
        }
        ponerInmersivo()
        // La depuración del WebView (chrome://inspect) existe SÓLO en la variante de depuración: en la release es `false` siempre.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        instalarPuente()
        configurarAtras()
        fijarPantallaDeInicio(servicios.ajustes.leer().optBoolean(AJUSTE_PANTALLA_DE_INICIO, false))
        servicios.actualizador.pantalla = this
        // La variante de depuración vive junto a la buena con otro paquete: no busca ni instala actualizaciones del canal.
        if (!BuildConfig.DEBUG) servicios.actualizador.iniciarRevisiones()
        if (savedInstanceState == null) irAlInicio(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.action == ACCION_DIAGNOSTICO) abrirDiagnostico()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) ponerInmersivo()
    }

    override fun onDestroy() {
        if (isFinishing) servicios.actualizador.detener()
        super.onDestroy()
    }

    // ---- Ventana ---------------------------------------------------------------------------------

    /** Sin barras de estado ni de navegación; reaparecen con un deslizamiento y se vuelven a esconder solas. */
    private fun ponerInmersivo() {
        val control = WindowInsetsControllerCompat(window, window.decorView)
        control.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        control.hide(WindowInsetsCompat.Type.systemBars())
    }

    private fun configurarAtras() {
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = atras()
            },
        )
    }

    /** Atrás sólo regresa dentro del POS; nunca sale de la app ni cae en una pantalla interna. */
    private fun atras() {
        val web = bridge.webView
        val historial = web.copyBackForwardList()
        val anterior = historial.getItemAtIndex(historial.currentIndex - 1)?.url ?: return
        val esDelPos = OrigenPermitido.esPermitido(anterior, BuildConfig.CLIENTE_DOMINIO) && !anterior.startsWith(bridge.localUrl)
        if (esDelPos && web.canGoBack()) web.goBack()
    }

    // ---- Pantalla de inicio (opcional) --------------------------------------------------------------

    /** Enciende o apaga el alias que deja elegir esta app como pantalla de inicio de Android (ajuste `pantallaDeInicio`). */
    fun fijarPantallaDeInicio(activa: Boolean) {
        val estado = if (activa) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        packageManager.setComponentEnabledSetting(ComponentName(this, ALIAS_DE_INICIO), estado, PackageManager.DONT_KILL_APP)
    }

    // ---- Puente ----------------------------------------------------------------------------------

    private fun instalarPuente() {
        val inyeccion = InyeccionDelPuente(this, bridge, BuildConfig.CLIENTE_DOMINIO)
        val modo = inyeccion.instalar()
        servicios.modoDelPuente = modo
        bridge.setWebViewClient(ClienteWebMorphiq(bridge, inyeccion, modo.planB))
        avisarUnaVezDelModo(modo)
    }

    /** Si el WebView es viejo, se dice UNA sola vez en la vida de la instalación (el detalle queda en Diagnóstico). El POS no se detiene. */
    private fun avisarUnaVezDelModo(modo: ModoDelPuente) {
        if (!modo.requiereAviso) return
        val ajustes = servicios.ajustes.leer()
        if (ajustes.optBoolean(AjustesMezcla.AVISO_DEL_PUENTE_MOSTRADO, false)) return
        servicios.ajustes.guardar(JSONObject().put(AjustesMezcla.AVISO_DEL_PUENTE_MOSTRADO, true))
        Toast.makeText(this, modo.avisoUnico(), Toast.LENGTH_LONG).show()
    }

    // ---- Navegación ------------------------------------------------------------------------------

    private fun irAlInicio(entrada: Intent?) {
        val primeraVez = !servicios.ajustes.leer().optBoolean(AjustesMezcla.PRIMER_ARRANQUE_HECHO, false)
        if (entrada?.action == ACCION_DIAGNOSTICO || primeraVez) abrirDiagnostico() else cargar(BuildConfig.CLIENTE_URL)
    }

    private fun cargar(url: String) = runOnUiThread { bridge.webView.loadUrl(url) }

    /** Carga el POS de producción y marca que el primer arranque ya pasó. */
    fun abrirPos() {
        servicios.ajustes.guardar(JSONObject().put(AjustesMezcla.PRIMER_ARRANQUE_HECHO, true))
        cargar(BuildConfig.CLIENTE_URL)
    }

    /** Diagnóstico es una pantalla local; si falta el permiso de Bluetooth se explica y se pide una sola vez por arranque. */
    fun abrirDiagnostico() {
        cargar("${bridge.localUrl}/diagnostico.html")
        if (!pidioBluetooth) {
            pidioBluetooth = true
            permisos.pedirBluetooth { }
        }
    }

    private var pidioBluetooth = false

    // ---- Actualización (diálogos) ------------------------------------------------------------------

    override fun preguntar(info: InfoDeActualizacion, alAceptar: () -> Unit) {
        runOnUiThread {
            // Si ya hay un aviso abierto no se apila otro (las revisiones se repiten cada 6 horas).
            if (preguntandoActualizacion) return@runOnUiThread
            preguntandoActualizacion = true
            val version = info.version.ifEmpty { "código ${info.versionCode}" }
            val notas = if (info.notas.isBlank()) "" else "\n\n${info.notas}"
            Avisos.explicar(
                this,
                getString(R.string.actualizacion_titulo),
                "${BuildConfig.CLIENTE_NOMBRE} tiene una actualización (versión $version).$notas",
                getString(R.string.actualizacion_boton_si),
                getString(R.string.actualizacion_boton_despues),
                alRechazar = { preguntandoActualizacion = false },
                alAceptar = {
                    preguntandoActualizacion = false
                    alAceptar()
                },
            )
        }
    }

    private var preguntandoActualizacion = false

    override fun explicarPermisoDeInstalar(alAceptar: () -> Unit) {
        runOnUiThread {
            Avisos.explicar(
                this,
                getString(R.string.aviso_instalar_titulo),
                getString(R.string.aviso_instalar_texto),
                getString(R.string.boton_entendido),
                getString(R.string.boton_ahora_no),
                alRechazar = {},
                alAceptar = alAceptar,
            )
        }
    }

    companion object {
        /** La acción del acceso directo «Diagnóstico» (la misma que escribe scripts/preparar.mjs). */
        const val ACCION_DIAGNOSTICO = "mx.morphiq.pos.app.DIAGNOSTICO"
        private const val ALIAS_DE_INICIO = "mx.morphiq.pos.app.PantallaDeInicio"
        const val AJUSTE_PANTALLA_DE_INICIO = "pantallaDeInicio"
    }
}
