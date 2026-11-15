package mx.morphiq.pos.app.puente

import android.util.Base64
import mx.morphiq.pos.app.logica.Codigo
import mx.morphiq.pos.app.logica.ResultadoDeTrabajo
import mx.morphiq.pos.app.logica.ResultadoFinal
import org.json.JSONObject

/** Un argumento que la página mandó mal o demasiado grande: se rechaza la llamada con el código `ARGUMENTOS`. */
class ArgumentoRechazado(mensaje: String) : Exception(mensaje)

/** Los JSON del contrato (`Resultado`) y utilidades para leer argumentos. */
object Respuestas {

    fun resultado(terminado: ResultadoFinal): JSONObject = JSONObject().apply {
        val r = terminado.resultado
        put("ok", r.ok)
        put("id", terminado.id)
        put("estado", r.estado)
        r.codigo?.let { put("codigo", it.name) }
        r.mensaje?.let { put("mensaje", it) }
        r.bytes?.let { put("bytes", it) }
        put("ms", terminado.ms)
    }

    /** Un fallo que se decide antes de encolar nada. */
    fun fallo(id: String, codigo: Codigo, mensaje: String): JSONObject = JSONObject().apply {
        put("ok", false)
        put("id", id)
        put("estado", ResultadoDeTrabajo.ERROR)
        put("codigo", codigo.name)
        put("mensaje", mensaje)
    }

    /** `null` si el texto no es base64 válido. */
    fun bytesDeBase64(texto: String): ByteArray? = try {
        Base64.decode(texto, Base64.DEFAULT)
    } catch (error: IllegalArgumentException) {
        null
    }

    fun entero(json: JSONObject?, llave: String): Int? =
        if (json != null && json.has(llave) && !json.isNull(llave)) json.optInt(llave) else null

    fun largo(json: JSONObject?, llave: String): Long? =
        if (json != null && json.has(llave) && !json.isNull(llave)) json.optLong(llave) else null
}
