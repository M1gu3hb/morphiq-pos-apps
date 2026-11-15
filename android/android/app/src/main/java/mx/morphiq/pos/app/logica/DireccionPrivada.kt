package mx.morphiq.pos.app.logica

/** Qué se decidió de la dirección de una impresora de red. */
enum class Veredicto { PERMITIDA, PUBLICA, NO_ES_LITERAL, VACIA }

/** [literal] es la dirección ya limpia (sin espacios ni corchetes) y sólo viene si el veredicto es [Veredicto.PERMITIDA]. */
class EvaluacionDeDireccion(val veredicto: Veredicto, val literal: String? = null)

/**
 * DP-D125: la impresión por red sólo va a direcciones de la red local. Se acepta ÚNICAMENTE un
 * literal IPv4 o IPv6 (jamás un nombre de host: nunca se consulta un DNS) que sea:
 *  - IPv4 privada (10/8, 172.16/12, 192.168/16), de enlace local (169.254/16) o loopback (127/8);
 *  - IPv6 de enlace local (fe80::/10, con o sin zona `%wlan0`), ULA (fc00::/7) o loopback (::1);
 *  - IPv4 mapeada en IPv6 (`::ffff:a.b.c.d`), que se juzga por la IPv4 que lleva dentro.
 *
 * El análisis es ESTRICTO a propósito: cuatro números decimales sin ceros a la izquierda (`010.0.0.1`
 * es octal para algunas librerías), sin formas cortas (`127.1`), hexadecimales (`0x7f.1`) ni enteros
 * (`2130706433`). Lo que se valida es lo mismo que luego se le da al socket, así que no hay dos
 * lecturas distintas de la misma dirección.
 */
object DireccionPrivada {
    private const val OCTETOS = 4
    private const val GRUPOS_IPV6 = 8
    private const val MAX_LARGO = 64
    private const val MAX_DIGITOS_OCTETO = 3
    private const val MAX_DIGITOS_GRUPO = 4
    private val ZONA = Regex("^[A-Za-z0-9_.-]{1,32}$")

    fun evaluar(texto: String?): EvaluacionDeDireccion {
        var limpio = texto?.trim().orEmpty()
        if (limpio.isEmpty()) return EvaluacionDeDireccion(Veredicto.VACIA)
        if (limpio.length > MAX_LARGO) return EvaluacionDeDireccion(Veredicto.NO_ES_LITERAL)
        if (limpio.startsWith("[") && limpio.endsWith("]")) limpio = limpio.substring(1, limpio.length - 1)

        ipv4(limpio)?.let { return decidir(esPrivadaIpv4(it), limpio) }
        return evaluarIpv6(limpio)
    }

    /** La dirección lista para el socket, o `null` si no se permite. */
    fun normalizar(texto: String?): String? = evaluar(texto).literal

    /**
     * La dirección permitida o un [ErrorDeImpresora] `NO_SOPORTADO` con el motivo en español.
     * Es lo que usan los transportes antes de abrir cualquier socket.
     */
    fun exigir(texto: String?): String {
        val evaluacion = evaluar(texto)
        return evaluacion.literal ?: throw ErrorDeImpresora(Codigo.NO_SOPORTADO, motivo(evaluacion.veredicto))
    }

    fun motivo(veredicto: Veredicto): String = when (veredicto) {
        Veredicto.VACIA -> "Falta la dirección de la impresora de red"
        Veredicto.NO_ES_LITERAL -> "La impresora de red se indica con su dirección IP completa (por ejemplo 192.168.1.50), no con un nombre"
        Veredicto.PUBLICA -> "Sólo se imprime en red hacia direcciones de tu red local (como 192.168.x.x o 10.x.x.x)"
        Veredicto.PERMITIDA -> ""
    }

    private fun decidir(privada: Boolean, literal: String) =
        if (privada) EvaluacionDeDireccion(Veredicto.PERMITIDA, literal) else EvaluacionDeDireccion(Veredicto.PUBLICA)

    // ---- IPv4 -----------------------------------------------------------------------------------

    /** Cuatro octetos decimales sin ceros a la izquierda, o `null` si el texto no es exactamente eso. */
    private fun ipv4(texto: String): IntArray? {
        val partes = texto.split('.')
        if (partes.size != OCTETOS) return null
        val octetos = IntArray(OCTETOS)
        for ((indice, parte) in partes.withIndex()) {
            if (parte.isEmpty() || parte.length > MAX_DIGITOS_OCTETO || !parte.all { it in '0'..'9' }) return null
            if (parte.length > 1 && parte[0] == '0') return null
            val valor = parte.toInt()
            if (valor > 255) return null
            octetos[indice] = valor
        }
        return octetos
    }

    private fun esPrivadaIpv4(o: IntArray): Boolean = when {
        o[0] == 10 -> true
        o[0] == 127 -> true
        o[0] == 172 && o[1] in 16..31 -> true
        o[0] == 192 && o[1] == 168 -> true
        o[0] == 169 && o[1] == 254 -> true
        else -> false
    }

    // ---- IPv6 -----------------------------------------------------------------------------------

    private fun evaluarIpv6(texto: String): EvaluacionDeDireccion {
        val partes = texto.split('%', limit = 2)
        val zona = partes.getOrNull(1)
        val direccion = partes[0]
        if (zona != null && !ZONA.matches(zona)) return EvaluacionDeDireccion(Veredicto.NO_ES_LITERAL)
        val grupos = gruposIpv6(direccion) ?: return EvaluacionDeDireccion(Veredicto.NO_ES_LITERAL)
        val enlaceLocal = (grupos[0] and 0xFFC0) == 0xFE80
        // Una zona sólo tiene sentido en fe80::/10; en cualquier otra dirección es una trampa.
        if (zona != null && !enlaceLocal) return EvaluacionDeDireccion(Veredicto.NO_ES_LITERAL)
        return decidir(esPrivadaIpv6(grupos, enlaceLocal), texto)
    }

    private fun esPrivadaIpv6(g: IntArray, enlaceLocal: Boolean): Boolean {
        val ceros = (0..6).all { g[it] == 0 }
        return when {
            ceros && g[7] == 1 -> true
            (g[0] and 0xFE00) == 0xFC00 -> true
            enlaceLocal -> true
            (0..4).all { g[it] == 0 } && g[5] == 0xFFFF ->
                esPrivadaIpv4(intArrayOf(g[6] shr 8, g[6] and 0xFF, g[7] shr 8, g[7] and 0xFF))
            else -> false
        }
    }

    /** Los 8 grupos de 16 bits de un literal IPv6, o `null` si el texto no es un IPv6 bien escrito. */
    private fun gruposIpv6(direccion: String): IntArray? {
        if (!direccion.contains(':') || direccion.contains(":::")) return null
        if (!direccion.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' || it == ':' || it == '.' }) return null

        // Una cola con IPv4 (`::ffff:1.2.3.4`) vale por dos grupos: se lee aparte y se sustituye por `0:0`.
        val corte = direccion.lastIndexOf(':')
        val cola = direccion.substring(corte + 1)
        val v4 = if (cola.contains('.')) (ipv4(cola) ?: return null) else null
        val texto = if (v4 != null) direccion.substring(0, corte + 1) + "0:0" else direccion

        val grupos = expandir(texto) ?: return null
        if (v4 != null) {
            grupos[6] = (v4[0] shl 8) or v4[1]
            grupos[7] = (v4[2] shl 8) or v4[3]
        }
        return grupos
    }

    private fun expandir(texto: String): IntArray? {
        val doble = texto.indexOf("::")
        if (doble != texto.lastIndexOf("::")) return null
        if (doble < 0) {
            val grupos = texto.split(':').map { grupo(it) ?: return null }
            return if (grupos.size == GRUPOS_IPV6) grupos.toIntArray() else null
        }
        val izquierda = leerLado(texto.substring(0, doble)) ?: return null
        val derecha = leerLado(texto.substring(doble + 2)) ?: return null
        if (izquierda.size + derecha.size > GRUPOS_IPV6 - 1) return null
        val resultado = IntArray(GRUPOS_IPV6)
        izquierda.forEachIndexed { i, valor -> resultado[i] = valor }
        derecha.forEachIndexed { i, valor -> resultado[GRUPOS_IPV6 - derecha.size + i] = valor }
        return resultado
    }

    private fun leerLado(lado: String): List<Int>? =
        if (lado.isEmpty()) emptyList() else lado.split(':').map { grupo(it) ?: return null }

    private fun grupo(texto: String): Int? =
        if (texto.isEmpty() || texto.length > MAX_DIGITOS_GRUPO || texto.contains('.')) null else texto.toIntOrNull(16)
}
