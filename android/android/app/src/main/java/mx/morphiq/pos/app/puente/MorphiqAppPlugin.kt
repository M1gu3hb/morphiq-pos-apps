package mx.morphiq.pos.app.puente

import android.os.Looper
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import mx.morphiq.pos.app.BuildConfig
import mx.morphiq.pos.app.MainActivity
import mx.morphiq.pos.app.logica.AjustesMezcla
import mx.morphiq.pos.app.logica.Conexiones
import mx.morphiq.pos.app.logica.Destino
import mx.morphiq.pos.app.logica.OrigenPermitido
import mx.morphiq.pos.app.logica.Topes
import org.json.JSONArray
import org.json.JSONObject

/**
 * El plugin `MorphiqApp`: la mitad nativa de `window.MorphiqApp` (contrato v1).
 *
 * SEGURIDAD: cada método, sin excepción, empieza por [protegido], que lee la URL ACTUAL del WebView
 * y rechaza con `ORIGEN` si no es https del dominio del cliente (o `https://localhost`, las
 * pantallas internas). La comparación es por host exacto (ver [OrigenPermitido]).
 */
@CapacitorPlugin(name = "MorphiqApp")
class MorphiqAppPlugin : Plugin() {
    private lateinit var principal: MainActivity
    private lateinit var servicios: ServiciosDeLaApp
    private lateinit var impresion: OperacionesDeImpresion
    private lateinit var lectura: OperacionesDeLectura

    override fun load() {
        principal = activity as MainActivity
        servicios = principal.servicios
        impresion = OperacionesDeImpresion(servicios)
        lectura = OperacionesDeLectura(servicios, impresion)
        servicios.emitir = { evento, datos -> notifyListeners(evento, JSObject.fromJSONObject(datos)) }
        servicios.actualizador.alCambiar = { estado -> notifyListeners("actualizacion", JSObject.fromJSONObject(estado.aJson())) }
    }

    // ---- Seguridad ----------------------------------------------------------------------------

    /** `WebView.getUrl()` sólo se puede leer en el hilo principal. Si no responde a tiempo, se rechaza. */
    private fun urlActual(): String? {
        val web = bridge.webView
        if (Looper.myLooper() == Looper.getMainLooper()) return web.url
        val respuesta = AtomicReference<String?>(null)
        val listo = CountDownLatch(1)
        principal.runOnUiThread {
            try {
                respuesta.set(web.url)
            } finally {
                listo.countDown()
            }
        }
        return if (listo.await(ESPERA_DE_URL_MS, TimeUnit.MILLISECONDS)) respuesta.get() else null
    }

    private fun origenPermitido(): Boolean = OrigenPermitido.esPermitido(urlActual(), BuildConfig.CLIENTE_DOMINIO)

    /** Revisa el origen y corre [accion]; un fallo inesperado se rechaza con su mensaje (y queda en el registro). */
    private fun protegido(call: PluginCall, accion: () -> Unit) {
        if (!origenPermitido()) {
            call.reject("Esta página no puede usar la app.", "ORIGEN")
            return
        }
        try {
            accion()
        } catch (error: ArgumentoRechazado) {
            call.reject(error.message, "ARGUMENTOS")
        } catch (error: Exception) {
            Log.e(ETIQUETA, "Falló ${call.methodName}: ${error.message}", error)
            call.reject(error.message ?: "La app no pudo hacerlo.", "DESCONOCIDO", error)
        }
    }

    private fun responder(call: PluginCall, json: JSONObject) = call.resolve(JSObject.fromJSONObject(json))

    /** Los argumentos de la llamada como JSON, si caben en [Topes.MAX_CARACTERES_LLAMADA]; si no, rechazo `ARGUMENTOS`. */
    private fun datos(call: PluginCall): JSONObject {
        val texto = call.data.toString()
        if (!Topes.llamadaCabe(texto.length)) throw ArgumentoRechazado("La solicitud es demasiado grande y no se acepta")
        return JSONObject(texto)
    }

    @PluginMethod(returnType = PluginMethod.RETURN_NONE)
    override fun addListener(call: PluginCall) {
        if (!origenPermitido()) {
            call.reject("Esta página no puede usar la app.", "ORIGEN")
            return
        }
        super.addListener(call)
    }

    // ---- Datos de la app y del aparato ----------------------------------------------------------

    @PluginMethod
    fun version(call: PluginCall) = protegido(call) { call.resolve(JSObject().put("valor", BuildConfig.VERSION_NAME)) }

    @PluginMethod
    fun plataforma(call: PluginCall) = protegido(call) { call.resolve(JSObject().put("valor", "android")) }

    @PluginMethod
    fun diagnostico(call: PluginCall) = protegido(call) { responder(call, lectura.diagnostico()) }

    @PluginMethod
    fun impresoras(call: PluginCall) = protegido(call) {
        val avisos = mutableListOf<String>()
        responder(call, JSONObject().put("impresoras", lectura.impresoras(avisos)))
    }

    @PluginMethod
    fun conexiones(call: PluginCall) = protegido(call) { responder(call, JSONObject().put("conexiones", lectura.conexiones())) }

    @PluginMethod
    fun modoLigero(call: PluginCall) = protegido(call) { responder(call, servicios.info.modoLigeroJson(servicios.ajustes.leer())) }

    // ---- Ajustes --------------------------------------------------------------------------------

    @PluginMethod
    fun ajustes(call: PluginCall) = protegido(call) { responder(call, servicios.ajustes.leer()) }

    @PluginMethod
    fun guardarAjustes(call: PluginCall) = protegido(call) {
        val antes = servicios.info.modoLigero(servicios.ajustes.leer())
        val parche = datos(call)
        // Se mide lo que QUEDARÍA guardado (lo de ahora más el parche), no sólo el parche.
        if (!Topes.ajustesCaben(AjustesMezcla.mezclar(servicios.ajustes.leer(), parche))) {
            throw ArgumentoRechazado("Los ajustes pesan más de ${Topes.legible(Topes.MAX_BYTES_AJUSTES)} y no se guardan")
        }
        val guardado = servicios.ajustes.guardar(parche)
        if (parche.has(MainActivity.AJUSTE_PANTALLA_DE_INICIO)) {
            principal.fijarPantallaDeInicio(guardado.optBoolean(MainActivity.AJUSTE_PANTALLA_DE_INICIO, false))
        }
        val despues = servicios.info.modoLigero(guardado)
        if (antes.activo != despues.activo) servicios.emitir("modo-ligero", JSONObject().put("activo", despues.activo))
        responder(call, guardado)
    }

    // ---- Impresión ------------------------------------------------------------------------------

    @PluginMethod
    fun imprimir(call: PluginCall) = protegido(call) {
        impresion.imprimir(datos(call), { responder(call, it) }, { call.reject(it, "ARGUMENTOS") })
    }

    @PluginMethod
    fun abrirCajon(call: PluginCall) = protegido(call) {
        impresion.abrirCajon(datos(call), { responder(call, it) }, { call.reject(it, "ARGUMENTOS") })
    }

    @PluginMethod
    fun paginaDePrueba(call: PluginCall) = protegido(call) { impresion.paginaDePrueba(datos(call)) { responder(call, it) } }

    @PluginMethod
    fun estado(call: PluginCall) = protegido(call) { lectura.estado(datos(call)) { responder(call, it) } }

    @PluginMethod
    fun reimprimirUltimo(call: PluginCall) = protegido(call) { impresion.reimprimirUltimo { responder(call, it) } }

    @PluginMethod
    fun ultimoTicket(call: PluginCall) = protegido(call) {
        responder(call, JSONObject().put("ticket", impresion.ultimoTicket() ?: JSONObject.NULL))
    }

    // ---- Permisos -------------------------------------------------------------------------------

    @PluginMethod
    fun pedirPermiso(call: PluginCall) = protegido(call) {
        val destino = Destino.desdeJson(datos(call).optJSONObject("destino"))
        when (destino?.conexion) {
            Conexiones.USB -> pedirPermisoUsb(call, destino)
            Conexiones.BLUETOOTH -> principal.permisos.pedirBluetooth { concedido ->
                responder(call, resultadoDePermiso(concedido, "No diste el permiso de Bluetooth."))
            }
            Conexiones.RED -> responder(call, resultadoDePermiso(true, null))
            else -> call.reject("Falta el destino (USB o Bluetooth) para pedir el permiso.", "ARGUMENTOS")
        }
    }

    private fun pedirPermisoUsb(call: PluginCall, destino: Destino) {
        val dispositivo = servicios.permisoUsb.encontrar(destino.vendorId ?: 0, destino.productId ?: 0)
        if (dispositivo == null) {
            responder(call, resultadoDePermiso(false, "No se encontró la impresora USB. Revisa el cable."))
        } else {
            principal.permisos.pedirUsb(dispositivo) { concedido -> responder(call, resultadoDePermiso(concedido, "No diste el permiso del USB.")) }
        }
    }

    private fun resultadoDePermiso(concedido: Boolean, mensajeSiNo: String?): JSONObject =
        JSONObject().put("concedido", concedido).apply { if (!concedido && mensajeSiNo != null) put("mensaje", mensajeSiNo) }

    // ---- Actualización --------------------------------------------------------------------------

    @PluginMethod
    fun buscarActualizacion(call: PluginCall) = protegido(call) {
        servicios.actualizador.buscar { responder(call, it.aJson()) }
    }

    @PluginMethod
    fun instalarActualizacion(call: PluginCall) = protegido(call) {
        servicios.actualizador.instalar { responder(call, it.aJson()) }
    }

    // ---- Pantallas internas ---------------------------------------------------------------------

    @PluginMethod
    fun abrirPos(call: PluginCall) = protegido(call) {
        principal.abrirPos()
        call.resolve()
    }

    @PluginMethod
    fun abrirDiagnostico(call: PluginCall) = protegido(call) {
        principal.abrirDiagnostico()
        call.resolve()
    }

    private companion object {
        const val ETIQUETA = "MorphiqPlugin"
        const val ESPERA_DE_URL_MS = 2_000L
    }
}
