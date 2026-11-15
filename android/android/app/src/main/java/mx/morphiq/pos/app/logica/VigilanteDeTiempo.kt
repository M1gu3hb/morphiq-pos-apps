package mx.morphiq.pos.app.logica

/**
 * Los sockets no tienen tiempo máximo para ESCRIBIR (sólo para leer): una impresora que se atora
 * dejaría el trabajo colgado para siempre. El vigilante llama a [alAgotarse] (que cierra el socket)
 * si pasan [esperaMs] sin que el envío avance; [latir] marca que sí avanzó.
 */
class VigilanteDeTiempo(private val esperaMs: Long, private val alAgotarse: () -> Unit) : AutoCloseable {
    @Volatile private var ultimoLatido = System.nanoTime()
    @Volatile var agotado = false
        private set

    private val hilo = Thread({
        try {
            while (!Thread.currentThread().isInterrupted) {
                Thread.sleep(SONDEO_MS)
                if ((System.nanoTime() - ultimoLatido) / NANOS_POR_MS > esperaMs) {
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
        ultimoLatido = System.nanoTime()
        hilo.start()
        return this
    }

    fun latir() {
        ultimoLatido = System.nanoTime()
    }

    override fun close() {
        hilo.interrupt()
    }

    private companion object {
        const val SONDEO_MS = 25L
        const val NANOS_POR_MS = 1_000_000L
    }
}
