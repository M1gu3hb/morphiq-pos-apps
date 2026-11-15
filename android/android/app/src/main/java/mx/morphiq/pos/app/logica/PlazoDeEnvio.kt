package mx.morphiq.pos.app.logica

/**
 * El tiempo TOTAL que se le da a un envío. La espera por escritura ([OpcionesDeEnvio.esperaMs]) sólo
 * cubre un bloque; sin un tope del conjunto, una impresora que contesta «un poquito» cada vez
 * tendría la cola ocupada para siempre.
 */
object PlazoDeEnvio {
    /** Una impresora que acepta menos de esto (2 KB/s) se da por atorada: las térmicas lentas reciben ~15 KB/s. */
    const val BYTES_POR_SEGUNDO_MINIMOS = 2_048L

    /** Ningún envío dura más de 5 minutos, por grande que sea el documento. */
    const val TOPE_ABSOLUTO_MS = 300_000L

    /** Holgura sobre la inactividad: el sistema tarda un poco en reportar el tiempo agotado de un bloque. */
    const val MARGEN_DE_INACTIVIDAD_MS = 1_000L

    /** Lo que se espera a lo más por [bytes] con estas [opciones]: la espera de un bloque, las pausas y la transmisión mínima. */
    fun totalMs(bytes: Int, opciones: OpcionesDeEnvio): Long {
        val bloque = if (opciones.bloqueBytes > 0) opciones.bloqueBytes else BLOQUE_POR_OMISION
        val bloques = (bytes.toLong() + bloque - 1) / bloque
        val transmision = bytes * 1000L / BYTES_POR_SEGUNDO_MINIMOS
        val total = opciones.esperaMs + bloques * opciones.pausaMs + transmision
        return total.coerceIn(opciones.esperaMs.coerceAtMost(TOPE_ABSOLUTO_MS), TOPE_ABSOLUTO_MS)
    }

    /** Cuánto puede pasar SIN que avance el envío: un bloque más su pausa más el margen. */
    fun inactividadMs(opciones: OpcionesDeEnvio): Long = opciones.esperaMs + opciones.pausaMs + MARGEN_DE_INACTIVIDAD_MS
}
