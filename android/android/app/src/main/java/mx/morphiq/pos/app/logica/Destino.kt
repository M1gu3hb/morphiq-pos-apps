package mx.morphiq.pos.app.logica

import org.json.JSONObject

/** Las conexiones del contrato que Android SÍ puede usar. */
object Conexiones {
    const val RED = "red"
    const val USB = "usb"
    const val BLUETOOTH = "bluetooth"

    /** Existen en el contrato pero sólo en Windows. */
    val SOLO_WINDOWS = mapOf(
        "spooler" to "El spooler de impresión de Windows no existe en Android",
        "driver" to "El driver de impresión de Windows no existe en Android",
        "serial" to "El puerto serie (COM) de Windows no existe en Android",
    )
}

const val PUERTO_RED_POR_OMISION = 9100

/** A dónde se manda un trabajo: es el `Destino` del contrato, sólo con lo que Android usa. */
data class Destino(
    val conexion: String,
    val host: String? = null,
    val puerto: Int? = null,
    val vendorId: Int? = null,
    val productId: Int? = null,
    val direccion: String? = null,
) {
    /** La clave de la cola: un trabajo a la vez por impresora. */
    fun clave(): String = when (conexion) {
        Conexiones.RED -> "red:${host?.lowercase()}:${puerto ?: PUERTO_RED_POR_OMISION}"
        Conexiones.USB -> "usb:$vendorId:$productId"
        Conexiones.BLUETOOTH -> "bluetooth:${direccion?.uppercase()}"
        else -> conexion
    }

    fun etiqueta(): String = when (conexion) {
        Conexiones.RED -> "red $host:${puerto ?: PUERTO_RED_POR_OMISION}"
        Conexiones.USB -> "USB"
        Conexiones.BLUETOOTH -> "Bluetooth"
        else -> conexion
    }

    fun aJson(): JSONObject = JSONObject().apply {
        put("conexion", conexion)
        host?.let { put("host", it) }
        puerto?.let { put("puerto", it) }
        vendorId?.let { put("vendorId", it) }
        productId?.let { put("productId", it) }
        direccion?.let { put("direccion", it) }
    }

    companion object {
        /** `null` si el objeto no trae una conexión. No valida que la conexión exista en Android. */
        fun desdeJson(json: JSONObject?): Destino? {
            if (json == null) return null
            val conexion = json.optString("conexion", "")
            if (conexion.isEmpty()) return null
            return Destino(
                conexion = conexion,
                host = json.optString("host", "").ifEmpty { null },
                puerto = if (json.has("puerto") && !json.isNull("puerto")) json.optInt("puerto") else null,
                vendorId = if (json.has("vendorId") && !json.isNull("vendorId")) json.optInt("vendorId") else null,
                productId = if (json.has("productId") && !json.isNull("productId")) json.optInt("productId") else null,
                direccion = json.optString("direccion", "").ifEmpty { null },
            )
        }

        /** Faltan datos para usar el destino: devuelve qué falta o `null` si está completo. */
        fun faltante(destino: Destino): String? = when (destino.conexion) {
            Conexiones.RED -> if (destino.host.isNullOrBlank()) "Falta la dirección de la impresora de red" else null
            Conexiones.USB -> if (destino.vendorId == null || destino.productId == null) "Falta identificar la impresora USB" else null
            Conexiones.BLUETOOTH -> if (destino.direccion.isNullOrBlank()) "Falta la dirección de la impresora Bluetooth" else null
            else -> "Esa conexión no existe en Android"
        }
    }
}
