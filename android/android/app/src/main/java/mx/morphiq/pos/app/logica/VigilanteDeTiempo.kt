package mx.morphiq.pos.app.logica

/**
 * Los sockets no tienen tiempo máximo para ESCRIBIR (sólo para leer) y una transferencia USB puede
 * ignorar el suyo: una impresora que se atora dejaría el trabajo colgado para siempre. El vigilante
 * llama a [alAgotarse] (que cierra el socket o la conexión) cuando se cumple CUALQUIERA de dos cosas:
 *  - pasan [esperaMs] sin que el envío avance ([latir] marca que sí avanzó), o
 *  - pasan [plazoTotalMs] desde [iniciar], avance o no (el tope del conjunto; ver [PlazoDeEnvio]).
 */
class VigilanteDeTiempo(
    private val esperaMs: Long,
    private val plazoTotalMs: Long = SIN_PLAZO_TOTAL,
    private val alAgotarse: () -> Unit,
) : AutoCloseable {
    @Volatile private var inicio = System.nanoTime()
    @Volatile private var ultimoLatido = inicio
    @Volatile var agotado = false
        private set

    private val hilo = Thread({
        try {
            while (!Thread.currentThread().isInterrupted) {
                Thread.sleep(SONDEO_MS)
                if (sinAvance() || plazoVencido()) {
                    agotado = true
                    alAgotarse()
                    return@Thread
                }
            }
        } catch (interrupcion: InterruptedException) {
            // El envío terminó (o falló) antes de agotar el tiempo: el vigilante ya no hace falta.
            Thread.currentThread().interrupt()
        }
    }, "vigilante-de-tiempo").apply { isDaemon = true }

    fun iniciar(): VigilanteDeTiempo {
        inicio = System.nanoTime()
        ultimoLatido = inicio
        hilo.start()
        return this
    }

    fun latir() {
        ultimoLatido = System.nanoTime()
    }

    /** Lo que queda del plazo total (0 si ya se acabó; un número enorme si no hay plazo total). */
    fun restanteMs(): Long = if (plazoTotalMs == SIN_PLAZO_TOTAL) Long.MAX_VALUE else maxOf(0L, plazoTotalMs - transcurridoMs(inicio))

    private fun sinAvance() = transcurridoMs(ultimoLatido) > esperaMs

    private fun plazoVencido() = plazoTotalMs != SIN_PLAZO_TOTAL && transcurridoMs(inicio) > plazoTotalMs

    private fun transcurridoMs(desde: Long) = (System.nanoTime() - desde) / NANOS_POR_MS

    override fun close() {
        hilo.interrupt()
    }

    companion object {
        const val SIN_PLAZO_TOTAL = -1L
        private const val SONDEO_MS = 25L
        private const val NANOS_POR_MS = 1_000_000L
    }
}
