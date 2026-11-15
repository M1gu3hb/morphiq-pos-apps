package mx.morphiq.pos.app.logica

/** La decisión del modo ligero: si está activo, quién lo decidió y por qué (lo que se muestra en Diagnóstico). */
data class DecisionDeModoLigero(val activo: Boolean, val origen: String, val motivo: String)

/**
 * Modo ligero: un aparato justo de memoria o de procesador necesita una página con menos
 * animaciones. Es automático (RAM ≤ 3 GB, ≤ 4 núcleos o aparato marcado «poca RAM» por Android) o
 * manual desde los ajustes (`modoLigero: true/false`; `null` = automático).
 */
object ModoLigero {
    const val RAM_MAXIMA_MB = 3 * 1024L
    const val NUCLEOS_MAXIMOS = 4

    fun decidir(manual: Boolean?, ramTotalMb: Long, nucleos: Int, aparatoDeRamBaja: Boolean): DecisionDeModoLigero {
        if (manual != null) {
            return DecisionDeModoLigero(
                activo = manual,
                origen = "manual",
                motivo = if (manual) "Lo encendieron en los ajustes de este aparato" else "Lo apagaron en los ajustes de este aparato",
            )
        }
        val motivos = buildList {
            if (aparatoDeRamBaja) add("Android lo marca como aparato de poca memoria")
            if (ramTotalMb in 1..RAM_MAXIMA_MB) add("tiene ${gb(ramTotalMb)} de RAM (límite ${gb(RAM_MAXIMA_MB)})")
            if (nucleos in 1..NUCLEOS_MAXIMOS) add("tiene $nucleos núcleos (límite $NUCLEOS_MAXIMOS)")
        }
        return if (motivos.isEmpty()) {
            DecisionDeModoLigero(false, "auto", "El aparato tiene memoria y procesador de sobra")
        } else {
            DecisionDeModoLigero(true, "auto", motivos.joinToString("; ").replaceFirstChar { it.uppercase() })
        }
    }

    private fun gb(mb: Long): String = String.format(java.util.Locale.ROOT, "%.1f GB", mb / 1024.0)
}
