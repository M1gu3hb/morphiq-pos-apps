package mx.morphiq.pos.app.logica

import org.json.JSONObject

/** Los ajustes del aparato: un objeto JSON con `version: 1`, `perfil` y `modoLigero` siempre presentes. */
object AjustesMezcla {
    const val VERSION = 1
    const val PRIMER_ARRANQUE_HECHO = "primerArranqueHecho"

    fun porOmision(): JSONObject = JSONObject().apply {
        put("version", VERSION)
        put("perfil", JSONObject.NULL)
        put("modoLigero", JSONObject.NULL)
        put(PRIMER_ARRANQUE_HECHO, false)
    }

    /** Lee lo guardado; un texto roto o ausente cae a los valores por omisión (y se completan las llaves que falten). */
    fun desdeTexto(texto: String?): JSONObject {
        val base = porOmision()
        if (texto.isNullOrBlank()) return base
        val guardado = try {
            JSONObject(texto)
        } catch (error: org.json.JSONException) {
            return base
        }
        return mezclar(base, guardado)
    }

    /** Mezcla SUPERFICIAL: cada llave del [parche] reemplaza a la de [actual]; `version` siempre queda en 1. */
    fun mezclar(actual: JSONObject, parche: JSONObject): JSONObject {
        val resultado = JSONObject(actual.toString())
        for (llave in parche.keys()) resultado.put(llave, parche.get(llave))
        resultado.put("version", VERSION)
        return resultado
    }

    /** `true` / `false` si el ajuste manual está fijado, `null` si es automático. */
    fun modoLigeroManual(ajustes: JSONObject): Boolean? =
        if (ajustes.has("modoLigero") && !ajustes.isNull("modoLigero")) ajustes.optBoolean("modoLigero") else null

    fun perfilDestino(ajustes: JSONObject): JSONObject? = ajustes.optJSONObject("perfil")?.optJSONObject("destino")

    fun perfilCajonBase64(ajustes: JSONObject): String? =
        ajustes.optJSONObject("perfil")?.optJSONObject("cajon")?.optString("base64", "")?.ifEmpty { null }
}
