package mx.morphiq.pos.app.logica

import java.io.File
import java.io.InputStream
import java.net.URI
import java.net.URISyntaxException
import java.security.MessageDigest
import org.json.JSONException
import org.json.JSONObject

/** Lo que dice `android.json` del canal de actualización. */
data class InfoDeActualizacion(
    val versionCode: Int,
    val version: String,
    val apk: String,
    val sha256: String,
    val notas: String,
)

object Actualizacion {
    private const val LARGO_SHA256 = 64
    private val NOMBRE_DE_APK = Regex("^[A-Za-z0-9._-]{1,120}[.]apk$")
    private val HEX = Regex("^[0-9a-fA-F]{$LARGO_SHA256}$")
    private const val HOST_GITHUB = "github.com"
    private const val SUFIJO_CONTENIDO_GITHUB = ".githubusercontent.com"

    /** `null` y el motivo en el segundo valor si el JSON no sirve. */
    fun leer(texto: String): Pair<InfoDeActualizacion?, String?> {
        val json = try {
            JSONObject(texto)
        } catch (error: JSONException) {
            return null to "El archivo de actualización no es un JSON válido"
        }
        val codigo = json.optInt("versionCode", -1)
        val apk = json.optString("apk", "")
        val sha = json.optString("sha256", "")
        return when {
            codigo < 1 -> null to "El archivo de actualización no trae «versionCode»"
            !NOMBRE_DE_APK.matches(apk) -> null to "El archivo de actualización trae un nombre de APK inválido"
            !HEX.matches(sha) -> null to "El archivo de actualización trae un sha256 inválido"
            else -> InfoDeActualizacion(codigo, json.optString("version", ""), apk, sha.lowercase(), json.optString("notas", "")) to null
        }
    }

    /** Hay actualización sólo si el código nuevo es MAYOR (un código igual o menor nunca instala). */
    fun hayNueva(codigoNuevo: Int, codigoActual: Int): Boolean = codigoNuevo > codigoActual

    /** Sólo https y sólo github.com o sus servidores de archivos (las redirecciones de un release). */
    fun urlDeDescargaPermitida(url: String): Boolean {
        val uri = try {
            URI(url)
        } catch (error: URISyntaxException) {
            return false
        }
        if (!"https".equals(uri.scheme, ignoreCase = true)) return false
        val host = uri.host?.lowercase() ?: return false
        if (uri.port != -1 && uri.port != 443) return false
        return host == HOST_GITHUB || (host.endsWith(SUFIJO_CONTENIDO_GITHUB) && host.length > SUFIJO_CONTENIDO_GITHUB.length)
    }

    /** El APK está en la misma carpeta que `android.json`. */
    fun urlDelApk(urlDelJson: String, apk: String): String = urlDelJson.substringBeforeLast('/') + "/" + apk

    fun sha256(entrada: InputStream): String {
        val resumen = MessageDigest.getInstance("SHA-256")
        val bufer = ByteArray(64 * 1024)
        while (true) {
            val leidos = entrada.read(bufer)
            if (leidos < 0) break
            resumen.update(bufer, 0, leidos)
        }
        return resumen.digest().joinToString("") { "%02x".format(it) }
    }

    fun coincideSha256(archivo: File, esperado: String): Boolean =
        archivo.inputStream().use { sha256(it) }.equals(esperado.trim(), ignoreCase = true)
}
