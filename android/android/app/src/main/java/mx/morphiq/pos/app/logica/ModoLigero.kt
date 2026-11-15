package mx.morphiq.pos.app.logica

/** La decisión del modo ligero: si está activo, quién lo decidió y por qué (lo que se muestra en Diagnóstico). */
data class DecisionDeModoLigero(val activo: Boolean, val origen: String, val motivo: String)

/**
 * Modo ligero: un aparato justo de memoria, de procesador o de navegador necesita una página con
 * menos animaciones. Es automático o manual desde los ajustes (`modoLigero: true/false`; `null` =
 * automático; lo que la persona eligió SIEMPRE se respeta).
 *
 * En automático se enciende si se cumple CUALQUIERA de estas señales (un falso positivo sólo quita
 * animaciones; un falso negativo deja lento un aparato como el iMin D4-503, RK3288 con 2 GB):
 *  - Android lo marca como aparato de poca memoria (`isLowRamDevice`).
 *  - RAM total ≤ [RAM_MAXIMA_MB] (3 GB): Android descuenta la memoria reservada, así que un aparato de «4 GB» reporta ~3.7 GB y NO entra.
 *  - ≤ [NUCLEOS_MAXIMOS] núcleos (4): con 4 la página compite con el propio sistema.
 *  - Sólo hay ABI de 32 bits (ver [soloAbi32]): hardware y Android de otra época, aunque el chip tenga muchos núcleos.
 *  - El WebView es anterior al [WEBVIEW_MAYOR_MINIMO] (111): un motor sin `color-mix`, `:has()` ni `dvh` también es lento con los efectos modernos.
 * Un dato que no se pudo leer (0, vacío o `null`) nunca enciende nada.
 */
object ModoLigero {
    const val RAM_MAXIMA_MB = 3 * 1024L
    const val NUCLEOS_MAXIMOS = 4
    const val WEBVIEW_MAYOR_MINIMO = 111

    fun decidir(
        manual: Boolean?,
        ramTotalMb: Long,
        nucleos: Int,
        aparatoDeRamBaja: Boolean,
        soloAbi32: Boolean = false,
        webViewMayor: Int? = null,
    ): DecisionDeModoLigero {
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
            if (soloAbi32) add("es de 32 bits")
            if (webViewMayor != null && webViewMayor in 1 until WEBVIEW_MAYOR_MINIMO) add("su WebView es el $webViewMayor (antes del $WEBVIEW_MAYOR_MINIMO)")
        }
        return if (motivos.isEmpty()) {
            DecisionDeModoLigero(false, "auto", "El aparato tiene memoria y procesador de sobra")
        } else {
            DecisionDeModoLigero(true, "auto", motivos.joinToString("; ").replaceFirstChar { it.uppercase() })
        }
    }

    /** `true` si hay ABIs y NINGUNA es de 64 bits (`arm64-v8a`, `x86_64`, `mips64`…). Sin datos, `false`. */
    fun soloAbi32(abis: List<String>): Boolean = abis.isNotEmpty() && abis.none { it.contains("64") }

    /** La versión mayor de un `versionName` de WebView («103.0.5060.71» → 103), o `null` si no empieza con un número. */
    fun versionMayor(versionName: String?): Int? =
        versionName?.trim()?.takeWhile { it in '0'..'9' }?.takeIf { it.isNotEmpty() && it.length <= 4 }?.toInt()

    private fun gb(mb: Long): String = String.format(java.util.Locale.ROOT, "%.1f GB", mb / 1024.0)
}
