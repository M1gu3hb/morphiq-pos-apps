package mx.morphiq.pos.app.logica

import java.io.OutputStream

const val BLOQUE_POR_OMISION = 4096
const val PAUSA_POR_OMISION_MS = 0L
const val ESPERA_POR_OMISION_MS = 10_000L

/** Cómo se entrega un documento: en bloques de [bloqueBytes], con [pausaMs] entre ellos, esperando a lo más [esperaMs]. */
data class OpcionesDeEnvio(
    val bloqueBytes: Int = BLOQUE_POR_OMISION,
    val pausaMs: Long = PAUSA_POR_OMISION_MS,
    val esperaMs: Long = ESPERA_POR_OMISION_MS,
)

/** Un camino hasta la impresora (red, USB, Bluetooth). Todo fallo se lanza como [ErrorDeImpresora]. */
interface Transporte {
    /** Entrega [bytes]; [alProgreso] recibe cuántos bytes van enviados. */
    fun enviar(bytes: ByteArray, opciones: OpcionesDeEnvio, alProgreso: (enviados: Int) -> Unit)

    /** Pregunta `DLE EOT 1/2/4` y lee las respuestas; las que no lleguen vienen `null`. */
    fun consultarEstado(esperaMs: Long): EstadoEscPos
}

/** Escribe por bloques, con la pausa pedida; lo comparten red y Bluetooth (que escriben en un `OutputStream`). */
object EnvioPorBloques {
    fun escribir(salida: OutputStream, bytes: ByteArray, opciones: OpcionesDeEnvio, alProgreso: (Int) -> Unit) {
        val bloque = if (opciones.bloqueBytes > 0) opciones.bloqueBytes else BLOQUE_POR_OMISION
        var enviados = 0
        while (enviados < bytes.size) {
            val largo = minOf(bloque, bytes.size - enviados)
            salida.write(bytes, enviados, largo)
            enviados += largo
            alProgreso(enviados)
            if (opciones.pausaMs > 0 && enviados < bytes.size) Thread.sleep(opciones.pausaMs)
        }
        salida.flush()
    }
}

/** Quita lo que no sirve de un trabajo antes de entregarlo (por ahora: bloque y pausa fuera de rango). */
fun opcionesSeguras(bloqueBytes: Int?, pausaMs: Long?, esperaMs: Long?): OpcionesDeEnvio = OpcionesDeEnvio(
    bloqueBytes = bloqueBytes?.takeIf { it in 1..MAX_BLOQUE } ?: BLOQUE_POR_OMISION,
    pausaMs = pausaMs?.takeIf { it in 0..MAX_PAUSA_MS } ?: PAUSA_POR_OMISION_MS,
    esperaMs = esperaMs?.takeIf { it in 1..MAX_ESPERA_MS } ?: ESPERA_POR_OMISION_MS,
)

private const val MAX_BLOQUE = 1_048_576
private const val MAX_PAUSA_MS = 10_000L
private const val MAX_ESPERA_MS = 120_000L
