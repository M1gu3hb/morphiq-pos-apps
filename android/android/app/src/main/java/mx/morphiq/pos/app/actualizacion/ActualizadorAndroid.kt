package mx.morphiq.pos.app.actualizacion

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import mx.morphiq.pos.app.logica.Actualizacion
import mx.morphiq.pos.app.logica.InfoDeActualizacion
import org.json.JSONObject

/** El estado de la actualización, tal como lo pide el contrato (`Actualizacion`). */
data class EstadoDeActualizacion(
    val estado: String,
    val versionActual: String,
    val versionNueva: String? = null,
    val avance: Double? = null,
    val mensaje: String? = null,
) {
    fun aJson(): JSONObject = JSONObject().apply {
        put("estado", estado)
        put("versionActual", versionActual)
        versionNueva?.let { put("versionNueva", it) }
        avance?.let { put("avance", it) }
        mensaje?.let { put("mensaje", it) }
    }
}

/** Lo que el actualizador necesita de la pantalla (diálogos); lo pone MainActivity. */
interface PantallaDeActualizacion {
    /** «POS Don Poncho tiene una actualización · Actualizar / Después». */
    fun preguntar(info: InfoDeActualizacion, alAceptar: () -> Unit)

    /** Explica que Android pide un permiso para instalar; al aceptar se abre ese ajuste. */
    fun explicarPermisoDeInstalar(alAceptar: () -> Unit)
}

/**
 * Busca `android.json` del canal (al abrir y cada 6 horas), avisa si hay una versión con
 * `versionCode` mayor, y la instala: baja el APK a una carpeta privada, VERIFICA su sha256 y abre
 * el instalador de Android (que exige que alguien toque «Instalar»).
 */
class ActualizadorAndroid(
    private val contexto: Context,
    private val urlDelCanal: String,
    private val versionCodeActual: Int,
    private val versionActual: String,
) {
    private val ejecutor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "actualizador").apply { isDaemon = true }
    }
    private val ocupado = AtomicBoolean(false)

    @Volatile private var pendiente: InfoDeActualizacion? = null
    @Volatile var estado: EstadoDeActualizacion = EstadoDeActualizacion("al-dia", versionActual)
        private set

    /** Quién se entera de cada cambio de estado (el plugin lo manda a la página como evento `actualizacion`). */
    @Volatile var alCambiar: (EstadoDeActualizacion) -> Unit = {}

    @Volatile var pantalla: PantallaDeActualizacion? = null

    /** Revisa ahora y luego cada 6 horas. Si hay una versión nueva, pregunta en pantalla. */
    fun iniciarRevisiones() {
        ejecutor.scheduleWithFixedDelay({ revisarYPreguntar() }, 0, HORAS_ENTRE_REVISIONES, TimeUnit.HOURS)
    }

    fun detener() {
        ejecutor.shutdownNow()
    }

    private fun revisarYPreguntar() {
        if (ocupado.get()) return
        val resultado = seguro { consultar() }
        val info = pendiente
        if (resultado.estado == "disponible" && info != null) {
            pantalla?.preguntar(info) { ejecutor.execute { seguro { instalarAhora() } } }
        }
    }

    /** Pregunta al canal si hay una versión mayor. Se puede llamar desde cualquier hilo. */
    fun buscar(alTerminar: (EstadoDeActualizacion) -> Unit) {
        ejecutor.execute { alTerminar(seguro { if (ocupado.get()) estado else consultar() }) }
    }

    /** Instala la versión pendiente (la busca si hace falta). */
    fun instalar(alTerminar: (EstadoDeActualizacion) -> Unit) {
        ejecutor.execute { alTerminar(seguro { instalarAhora() }) }
    }

    /** Un fallo inesperado se informa (estado «error»): no cancela las revisiones futuras ni deja sin respuesta a la página. */
    private fun seguro(accion: () -> EstadoDeActualizacion): EstadoDeActualizacion = try {
        accion()
    } catch (error: Exception) {
        Log.e(ETIQUETA, "Falló la actualización: ${error.message}", error)
        cambiar(EstadoDeActualizacion("error", versionActual, mensaje = "La actualización falló (${error.javaClass.simpleName})"))
    }

    private fun consultar(): EstadoDeActualizacion {
        return try {
            val (info, motivo) = Actualizacion.leer(ClienteHttps.leerTexto(urlDelCanal, MAX_JSON_BYTES))
            when {
                info == null -> cambiar(EstadoDeActualizacion("error", versionActual, mensaje = motivo))
                Actualizacion.hayNueva(info.versionCode, versionCodeActual) -> {
                    pendiente = info
                    cambiar(EstadoDeActualizacion("disponible", versionActual, versionNueva = info.version.ifEmpty { "código ${info.versionCode}" }, mensaje = info.notas.ifEmpty { null }))
                }
                else -> {
                    pendiente = null
                    cambiar(EstadoDeActualizacion("al-dia", versionActual))
                }
            }
        } catch (error: IOException) {
            Log.w(ETIQUETA, "No se pudo consultar el canal de actualización: ${error.message}")
            cambiar(EstadoDeActualizacion("error", versionActual, mensaje = "No se pudo buscar la actualización (${mensajeCorto(error)})"))
        }
    }

    private fun instalarAhora(): EstadoDeActualizacion {
        if (!ocupado.compareAndSet(false, true)) return estado
        try {
            if (pendiente == null) {
                val consulta = consultar()
                if (consulta.estado != "disponible") return consulta
            }
            val info = pendiente ?: return estado
            if (!puedeInstalar()) return pedirPermisoDeInstalar(info)
            return descargarYVerificar(info)
        } finally {
            ocupado.set(false)
        }
    }

    private fun puedeInstalar(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || contexto.packageManager.canRequestPackageInstalls()

    private fun pedirPermisoDeInstalar(info: InfoDeActualizacion): EstadoDeActualizacion {
        val mensaje = "Falta el permiso para instalar. Actívalo en el ajuste que se abre y vuelve a tocar «Actualizar»."
        val abrir = {
            val intento = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${contexto.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            contexto.startActivity(intento)
        }
        val ventana = pantalla
        if (ventana != null) ventana.explicarPermisoDeInstalar(abrir) else abrir()
        return cambiar(EstadoDeActualizacion("error", versionActual, versionNueva = info.version, mensaje = mensaje))
    }

    private fun descargarYVerificar(info: InfoDeActualizacion): EstadoDeActualizacion {
        val carpeta = File(contexto.filesDir, CARPETA).apply { mkdirs() }
        carpeta.listFiles()?.forEach { it.delete() }
        val parcial = File(carpeta, info.apk + ".part")
        val definitivo = File(carpeta, info.apk)
        val nueva = info.version.ifEmpty { "código ${info.versionCode}" }
        try {
            var ultimoAviso = 0L
            cambiar(EstadoDeActualizacion("descargando", versionActual, nueva, 0.0))
            ClienteHttps.descargar(Actualizacion.urlDelApk(urlDelCanal, info.apk), parcial) { fraccion ->
                val ahora = System.currentTimeMillis()
                if (fraccion >= 0 && ahora - ultimoAviso > AVISO_DE_AVANCE_MS) {
                    ultimoAviso = ahora
                    cambiar(EstadoDeActualizacion("descargando", versionActual, nueva, fraccion))
                }
            }
            if (!Actualizacion.coincideSha256(parcial, info.sha256)) {
                parcial.delete()
                return cambiar(EstadoDeActualizacion("error", versionActual, nueva, mensaje = "El archivo bajado no coincide con el sha256 esperado: no se instala."))
            }
            if (!parcial.renameTo(definitivo)) throw IOException("No se pudo guardar el APK")
            lanzarInstalador(definitivo)
            return cambiar(EstadoDeActualizacion("lista", versionActual, nueva, 1.0, "Toca «Instalar» en la pantalla de Android."))
        } catch (error: IOException) {
            parcial.delete()
            Log.w(ETIQUETA, "Falló la descarga de la actualización: ${error.message}")
            return cambiar(EstadoDeActualizacion("error", versionActual, nueva, mensaje = "No se pudo bajar la actualización (${mensajeCorto(error)})"))
        }
    }

    private fun lanzarInstalador(apk: File) {
        val uri = FileProvider.getUriForFile(contexto, "${contexto.packageName}.fileprovider", apk)
        val intento = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        contexto.startActivity(intento)
    }

    private fun cambiar(nuevo: EstadoDeActualizacion): EstadoDeActualizacion {
        estado = nuevo
        alCambiar(nuevo)
        return nuevo
    }

    private fun mensajeCorto(error: IOException): String = (error.message ?: error.javaClass.simpleName).take(MAX_MENSAJE)

    private companion object {
        const val ETIQUETA = "MorphiqActualizador"
        const val CARPETA = "actualizaciones"
        const val HORAS_ENTRE_REVISIONES = 6L
        const val MAX_JSON_BYTES = 64 * 1024
        const val AVISO_DE_AVANCE_MS = 400L
        const val MAX_MENSAJE = 80
    }
}
