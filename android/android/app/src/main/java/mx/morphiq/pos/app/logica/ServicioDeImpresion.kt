package mx.morphiq.pos.app.logica

/** Un trabajo ya validado: bytes listos, destino resuelto. */
class TrabajoDeImpresion(
    val id: String,
    val destino: Destino,
    val bytes: ByteArray,
    val copias: Int = 1,
    val opciones: OpcionesDeEnvio = OpcionesDeEnvio(),
)

/** El resultado final de un trabajo, con cuánto tardó. */
data class ResultadoFinal(val id: String, val resultado: ResultadoDeTrabajo, val ms: Long)

/**
 * Entrega un trabajo a su impresora por la cola (un trabajo a la vez por destino, en orden), con
 * copias, progreso y los fallos ya traducidos a los códigos del contrato.
 */
class ServicioDeImpresion(
    private val cola: ColaDeImpresion,
    private val fabrica: (Destino) -> Transporte,
    private val reloj: () -> Long = System::currentTimeMillis,
) {
    fun imprimir(
        trabajo: TrabajoDeImpresion,
        alProgreso: (id: String, enviados: Int, total: Int) -> Unit,
        alTerminar: (ResultadoFinal) -> Unit,
    ) {
        val total = trabajo.bytes.size * maxOf(1, trabajo.copias)
        val inicio = reloj()
        cola.encolar(
            clave = trabajo.destino.clave(),
            id = trabajo.id,
            ejecutar = { entregar(trabajo, total, alProgreso) },
            alTerminar = { resultado -> alTerminar(ResultadoFinal(trabajo.id, resultado, reloj() - inicio)) },
        )
    }

    private fun entregar(trabajo: TrabajoDeImpresion, total: Int, alProgreso: (String, Int, Int) -> Unit): ResultadoDeTrabajo =
        entregarCopias(trabajo.copias) { copia ->
            try {
                val base = (copia - 1) * trabajo.bytes.size
                fabrica(trabajo.destino).enviar(trabajo.bytes, trabajo.opciones) { enviados ->
                    alProgreso(trabajo.id, base + enviados, total)
                }
                ResultadoDeTrabajo.enviado(trabajo.bytes.size)
            } catch (error: Throwable) {
                ResultadoDeTrabajo.fallo(TraductorDeErrores.traducir(error, trabajo.opciones.esperaMs))
            }
        }
}
