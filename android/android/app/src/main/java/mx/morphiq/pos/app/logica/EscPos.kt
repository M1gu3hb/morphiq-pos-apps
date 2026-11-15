package mx.morphiq.pos.app.logica

import java.io.ByteArrayOutputStream
import java.text.Normalizer

/** El estado leído con `DLE EOT 1/2/4`; cada campo es `null` si la impresora no contestó esa consulta. */
data class EstadoEscPos(val enLinea: Boolean?, val sinPapel: Boolean?, val tapaAbierta: Boolean?) {
    /** `true` si la impresora contestó alguna de las tres consultas. */
    fun contesto(): Boolean = enLinea != null || sinPapel != null || tapaAbierta != null
}

/**
 * Los únicos bytes ESC/POS que la app arma sola (el resto lo arma la página): la página de prueba,
 * el pulso del cajón y el renglón de reimpresión. Todo en ASCII para que cualquier impresora lo
 * imprima igual, sin depender de su tabla de caracteres.
 */
object EscPos {
    private const val ESC = 0x1B
    private const val GS = 0x1D
    private const val DLE = 0x10
    private const val EOT = 0x04
    private const val LINEAS_DE_AVANCE = 4

    /** `ESC @`: reinicia la impresora. */
    val INICIAR: ByteArray = byteArrayOf(ESC.toByte(), 0x40)

    /** `ESC p 0 25 250`: pulso al cajón (pin 2, 50 ms encendido, 500 ms apagado). */
    val PULSO_CAJON: ByteArray = byteArrayOf(ESC.toByte(), 0x70, 0, 25, 250.toByte())

    /** `GS V 66 0`: avanza hasta la cuchilla y corta. */
    val CORTE: ByteArray = byteArrayOf(GS.toByte(), 0x56, 66, 0)

    /** `DLE EOT n` con n = 1 (impresora), 2 (causa de fuera de línea) o 4 (sensor de papel). */
    fun consultaDeEstado(n: Int): ByteArray = byteArrayOf(DLE.toByte(), EOT.toByte(), n.toByte())

    /** Quita acentos y cualquier carácter que no sea ASCII imprimible («Don Poncho · Ñ» → «Don Poncho ? N»). */
    fun soloAscii(texto: String): String {
        val sinAcentos = Normalizer.normalize(texto, Normalizer.Form.NFD).replace(Regex("[\\p{Mn}\\p{Me}\\p{Mc}]+"), "")
        return sinAcentos.map { if (it.code in 0x20..0x7E) it else '?' }.joinToString("")
    }

    private fun renglon(salida: ByteArrayOutputStream, texto: String) {
        salida.write(soloAscii(texto).toByteArray(Charsets.US_ASCII))
        salida.write('\n'.code)
    }

    fun paginaDePrueba(nombreDelCliente: String, fechaHora: String, conexion: String): ByteArray {
        val salida = ByteArrayOutputStream()
        salida.write(INICIAR)
        renglon(salida, nombreDelCliente)
        renglon(salida, fechaHora)
        renglon(salida, "Pagina de prueba")
        renglon(salida, "Conexion: $conexion")
        salida.write(byteArrayOf(ESC.toByte(), 0x64, LINEAS_DE_AVANCE.toByte()))
        salida.write(CORTE)
        return salida.toByteArray()
    }

    /** El renglón de texto simple que se antepone al reimprimir: «*** REIMPRESION 31/10/2026 14:05 ***». */
    fun renglonDeReimpresion(fechaHora: String): ByteArray =
        "*** REIMPRESION ${soloAscii(fechaHora)} ***\n".toByteArray(Charsets.US_ASCII)

    /** El renglón de reimpresión seguido del documento recordado. */
    fun reimpresion(fechaHora: String, documento: ByteArray): ByteArray =
        renglonDeReimpresion(fechaHora) + documento

    /** Lee las tres respuestas (un byte cada una) según la tabla de estado de Epson ESC/POS. */
    fun decodificarEstado(impresora: Int?, causa: Int?, papel: Int?): EstadoEscPos = EstadoEscPos(
        enLinea = impresora?.let { (it and 0x08) == 0 },
        tapaAbierta = causa?.let { (it and 0x04) != 0 },
        sinPapel = if (papel == null && causa == null) null else {
            ((papel ?: 0) and 0x60) != 0 || ((causa ?: 0) and 0x20) != 0
        },
    )
}
