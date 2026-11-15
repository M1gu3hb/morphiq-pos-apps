package mx.morphiq.pos.app.logica

import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/** Los códigos estables del contrato (`CodigoDeError`). */
enum class Codigo {
    ORIGEN,
    SIN_PERFIL,
    NO_SOPORTADO,
    SIN_PERMISO,
    DESCONECTADA,
    SIN_PAPEL,
    TAPA_ABIERTA,
    TIEMPO,
    CANCELADO,
    DESCONOCIDO,
}

/** Un fallo de impresión ya traducido: el código es estable y el mensaje es para la persona. */
class ErrorDeImpresora(val codigo: Codigo, mensaje: String, causa: Throwable? = null) : Exception(mensaje, causa)

/** Convierte lo que lance el hardware en códigos del contrato con mensajes cortos en español. */
object TraductorDeErrores {
    private val PISTAS_DE_DESCONEXION = listOf("broken pipe", "socket closed", "read failed", "connection reset", "connection abort", "epipe", "econnreset", "device not found", "no such device")

    fun traducir(error: Throwable, esperaMs: Long): ErrorDeImpresora = when (error) {
        is ErrorDeImpresora -> error
        is SocketTimeoutException -> tiempo(esperaMs, error)
        is ConnectException, is NoRouteToHostException, is UnknownHostException ->
            ErrorDeImpresora(Codigo.DESCONECTADA, "Impresora desconectada", error)
        is SecurityException -> ErrorDeImpresora(Codigo.SIN_PERMISO, "Falta un permiso para usar la impresora", error)
        is InterruptedException -> ErrorDeImpresora(Codigo.CANCELADO, "Se canceló la impresión", error)
        is IOException -> desdeIo(error)
        else -> ErrorDeImpresora(Codigo.DESCONOCIDO, "No se pudo imprimir", error)
    }

    fun tiempo(esperaMs: Long, causa: Throwable? = null): ErrorDeImpresora =
        ErrorDeImpresora(Codigo.TIEMPO, "No respondió en ${segundos(esperaMs)} s", causa)

    /** `10 000` → «10», `1500` → «1.5». */
    fun segundos(ms: Long): String {
        val s = ms / 1000.0
        return if (s == Math.floor(s)) s.toLong().toString() else String.format(java.util.Locale.ROOT, "%.1f", s)
    }

    private fun desdeIo(error: IOException): ErrorDeImpresora {
        val texto = (error.message ?: "").lowercase()
        return if (PISTAS_DE_DESCONEXION.any { texto.contains(it) }) {
            ErrorDeImpresora(Codigo.DESCONECTADA, "Impresora desconectada", error)
        } else {
            ErrorDeImpresora(Codigo.DESCONOCIDO, "No se pudo imprimir", error)
        }
    }

    /** Lo que dice la impresora por `DLE EOT` → el error que le corresponde, o `null` si está bien. */
    fun desdeEstado(estado: EstadoEscPos): ErrorDeImpresora? = when {
        estado.sinPapel == true -> ErrorDeImpresora(Codigo.SIN_PAPEL, "Sin papel")
        estado.tapaAbierta == true -> ErrorDeImpresora(Codigo.TAPA_ABIERTA, "Tapa abierta")
        estado.enLinea == false -> ErrorDeImpresora(Codigo.DESCONECTADA, "Impresora fuera de línea")
        else -> null
    }
}
