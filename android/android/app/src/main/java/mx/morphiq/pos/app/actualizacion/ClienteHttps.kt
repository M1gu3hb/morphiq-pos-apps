package mx.morphiq.pos.app.actualizacion

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import mx.morphiq.pos.app.logica.Actualizacion

/**
 * Descargas de la actualización: sólo https, sólo GitHub (y sus servidores de archivos, adonde un
 * release redirige). Las redirecciones se siguen A MANO para revisar cada salto contra la lista.
 */
object ClienteHttps {
    private const val MAX_REDIRECCIONES = 5
    private const val CONEXION_MS = 15_000
    private const val LECTURA_MS = 30_000
    private const val BUFER = 32 * 1024
    private val REDIRECCIONES = setOf(301, 302, 303, 307, 308)

    fun abrir(urlInicial: String): HttpURLConnection {
        var actual = urlInicial
        repeat(MAX_REDIRECCIONES + 1) {
            if (!Actualizacion.urlDeDescargaPermitida(actual)) throw IOException("Dirección no permitida para descargar")
            val conexion = URL(actual).openConnection() as HttpURLConnection
            conexion.instanceFollowRedirects = false
            conexion.connectTimeout = CONEXION_MS
            conexion.readTimeout = LECTURA_MS
            conexion.setRequestProperty("Accept", "application/octet-stream, application/json")
            val codigo = conexion.responseCode
            if (codigo in REDIRECCIONES) {
                val destino = conexion.getHeaderField("Location")
                conexion.disconnect()
                if (destino.isNullOrBlank()) throw IOException("Redirección sin destino")
                actual = URL(URL(actual), destino).toString()
            } else if (codigo == HttpURLConnection.HTTP_OK) {
                return conexion
            } else {
                conexion.disconnect()
                throw IOException("El servidor respondió $codigo")
            }
        }
        throw IOException("Demasiadas redirecciones")
    }

    /** Un texto pequeño (el `android.json`), con tope de tamaño. */
    fun leerTexto(url: String, maxBytes: Int): String {
        val conexion = abrir(url)
        try {
            val salida = ByteArrayOutputStream()
            conexion.inputStream.use { entrada ->
                val bufer = ByteArray(BUFER)
                while (true) {
                    val leidos = entrada.read(bufer)
                    if (leidos < 0) break
                    if (salida.size() + leidos > maxBytes) throw IOException("El archivo de actualización es demasiado grande")
                    salida.write(bufer, 0, leidos)
                }
            }
            return salida.toString(Charsets.UTF_8.name())
        } finally {
            conexion.disconnect()
        }
    }

    /** Baja un archivo a [destino]; [alAvance] recibe la fracción 0..1 (o -1 si el servidor no dijo el tamaño). */
    fun descargar(url: String, destino: File, alAvance: (Double) -> Unit) {
        val conexion = abrir(url)
        try {
            val total = conexion.contentLengthLong
            var bajados = 0L
            conexion.inputStream.use { entrada ->
                destino.outputStream().use { salida ->
                    val bufer = ByteArray(BUFER)
                    while (true) {
                        val leidos = entrada.read(bufer)
                        if (leidos < 0) break
                        salida.write(bufer, 0, leidos)
                        bajados += leidos
                        alAvance(if (total > 0) bajados.toDouble() / total else -1.0)
                    }
                }
            }
        } finally {
            conexion.disconnect()
        }
    }
}
