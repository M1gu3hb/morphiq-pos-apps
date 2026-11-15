package mx.morphiq.pos.app.puente

import android.content.Context
import android.util.Base64
import android.util.Log
import java.io.File
import java.io.IOException
import mx.morphiq.pos.app.logica.AjustesMezcla
import mx.morphiq.pos.app.logica.RegistroDeEntregados
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

private const val ETIQUETA = "MorphiqAlmacen"
private const val ARCHIVO_DE_PREFERENCIAS = "morphiq_app"

/** Los ajustes del aparato, en SharedPreferences como un solo JSON. */
class AlmacenDeAjustes(contexto: Context) {
    private val preferencias = contexto.getSharedPreferences(ARCHIVO_DE_PREFERENCIAS, Context.MODE_PRIVATE)

    @Synchronized
    fun leer(): JSONObject = AjustesMezcla.desdeTexto(preferencias.getString(LLAVE, null))

    /** Mezcla superficial del [parche] sobre lo guardado; devuelve el resultado. */
    @Synchronized
    fun guardar(parche: JSONObject): JSONObject {
        val nuevo = AjustesMezcla.mezclar(leer(), parche)
        preferencias.edit().putString(LLAVE, nuevo.toString()).apply()
        return nuevo
    }

    private companion object {
        const val LLAVE = "ajustes"
    }
}

/** Los últimos ids entregados, para no imprimir dos veces el mismo ticket tras reiniciar la app. */
class RegistroDeEntregadosEnPreferencias(contexto: Context) : RegistroDeEntregados {
    private val preferencias = contexto.getSharedPreferences(ARCHIVO_DE_PREFERENCIAS, Context.MODE_PRIVATE)

    override fun cargar(): List<String> {
        val texto = preferencias.getString(LLAVE, null) ?: return emptyList()
        return try {
            val arreglo = JSONArray(texto)
            (0 until arreglo.length()).map { arreglo.getString(it) }
        } catch (error: JSONException) {
            Log.w(ETIQUETA, "Se descarta la lista de ids entregados dañada: ${error.message}")
            emptyList()
        }
    }

    override fun guardar(ids: List<String>) {
        preferencias.edit().putString(LLAVE, JSONArray(ids).toString()).apply()
    }

    private companion object {
        const val LLAVE = "entregados"
    }
}

/** El «último ticket» recordado por `imprimir({ recordar })`, en un archivo privado de la app. */
class UltimoTicket(private val archivo: File) {

    class Guardado(val titulo: String, val guardadoEn: String, val bytes: ByteArray, val bloqueBytes: Int?, val pausaMs: Long?)

    @Synchronized
    fun guardar(titulo: String, bytes: ByteArray, bloqueBytes: Int?, pausaMs: Long?, guardadoEn: String) {
        val json = JSONObject().apply {
            put("titulo", titulo)
            put("guardadoEn", guardadoEn)
            put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            bloqueBytes?.let { put("bloqueBytes", it) }
            pausaMs?.let { put("pausaMs", it) }
        }
        val temporal = File(archivo.parentFile, archivo.name + ".tmp")
        temporal.writeText(json.toString(), Charsets.UTF_8)
        if (!temporal.renameTo(archivo)) throw IOException("No se pudo guardar el último ticket")
    }

    /** `null` si no hay ninguno (o si el archivo está dañado: se avisa en el registro y se ignora). */
    @Synchronized
    fun leer(): Guardado? {
        if (!archivo.exists()) return null
        return try {
            val json = JSONObject(archivo.readText(Charsets.UTF_8))
            Guardado(
                titulo = json.getString("titulo"),
                guardadoEn = json.getString("guardadoEn"),
                bytes = Base64.decode(json.getString("base64"), Base64.DEFAULT),
                bloqueBytes = if (json.has("bloqueBytes")) json.getInt("bloqueBytes") else null,
                pausaMs = if (json.has("pausaMs")) json.getLong("pausaMs") else null,
            )
        } catch (error: JSONException) {
            Log.w(ETIQUETA, "El último ticket guardado está dañado y se ignora: ${error.message}")
            null
        } catch (error: IllegalArgumentException) {
            Log.w(ETIQUETA, "El último ticket guardado tiene un base64 inválido: ${error.message}")
            null
        }
    }
}
