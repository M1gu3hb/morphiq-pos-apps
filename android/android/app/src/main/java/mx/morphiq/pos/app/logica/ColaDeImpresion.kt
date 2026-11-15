package mx.morphiq.pos.app.logica

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Qué pasó con un trabajo, ya con el código del contrato si falló. */
data class ResultadoDeTrabajo(
    val ok: Boolean,
    val estado: String,
    val codigo: Codigo? = null,
    val mensaje: String? = null,
    val bytes: Int? = null,
) {
    companion object {
        const val IMPRESO = "impreso"
        const val ENVIADO = "enviado"
        const val DUPLICADO = "duplicado"
        const val ERROR = "error"

        fun enviado(bytes: Int) = ResultadoDeTrabajo(true, ENVIADO, bytes = bytes)
        fun duplicado() = ResultadoDeTrabajo(true, DUPLICADO)
        fun fallo(error: ErrorDeImpresora) = ResultadoDeTrabajo(false, ERROR, error.codigo, error.message)
    }
}

/** Dónde se guardan los ids ya entregados para que sobrevivan a un reinicio de la app. */
interface RegistroDeEntregados {
    fun cargar(): List<String>
    fun guardar(ids: List<String>)
}

class RegistroEnMemoria : RegistroDeEntregados {
    private var ids: List<String> = emptyList()
    override fun cargar(): List<String> = ids
    override fun guardar(ids: List<String>) {
        this.ids = ids
    }
}

/**
 * La cola de impresión: UN trabajo a la vez por impresora (clave = destino), en el orden en que
 * llegaron; impresoras distintas no se estorban. Recuerda los últimos [MEMORIA] ids ENTREGADOS y a
 * uno repetido responde `duplicado` sin imprimir; un trabajo que falló NO se recuerda, así que su
 * reintento con el mismo id sí vuelve a imprimir.
 */
class ColaDeImpresion(
    private val registro: RegistroDeEntregados = RegistroEnMemoria(),
    private val crearEjecutor: () -> ExecutorService = { Executors.newSingleThreadExecutor { r -> Thread(r, "cola-impresion").apply { isDaemon = true } } },
) {
    private val ejecutores = HashMap<String, ExecutorService>()
    private val entregados = LinkedHashSet<String>(registro.cargar())

    /**
     * Encola el trabajo [id] en la cola de [clave]. [ejecutar] corre en el hilo de esa cola, sólo si
     * el id no se había entregado; [alTerminar] recibe el resultado en ese mismo hilo.
     */
    fun encolar(clave: String, id: String, ejecutar: () -> ResultadoDeTrabajo, alTerminar: (ResultadoDeTrabajo) -> Unit) {
        ejecutorDe(clave).execute {
            alTerminar(correr(id, ejecutar))
        }
    }

    /** Corre una tarea cualquiera en la cola de [clave] (p. ej. consultar el estado sin atravesarse con una impresión). */
    fun enCola(clave: String, tarea: () -> Unit) {
        ejecutorDe(clave).execute { tarea() }
    }

    private fun correr(id: String, ejecutar: () -> ResultadoDeTrabajo): ResultadoDeTrabajo {
        if (yaEntregado(id)) return ResultadoDeTrabajo.duplicado()
        val resultado = try {
            ejecutar()
        } catch (error: Throwable) {
            ResultadoDeTrabajo.fallo(TraductorDeErrores.traducir(error, 0))
        }
        if (resultado.ok) recordar(id)
        return resultado
    }

    @Synchronized
    private fun yaEntregado(id: String): Boolean = entregados.contains(id)

    @Synchronized
    private fun recordar(id: String) {
        entregados.remove(id)
        entregados.add(id)
        while (entregados.size > MEMORIA) entregados.remove(entregados.first())
        registro.guardar(entregados.toList())
    }

    @Synchronized
    private fun ejecutorDe(clave: String): ExecutorService = ejecutores.getOrPut(clave) { crearEjecutor() }

    fun apagar() {
        synchronized(this) { ejecutores.values.toList() }.forEach { it.shutdown() }
    }

    companion object {
        const val MEMORIA = 50
    }
}

/** Repite el documento [copias] veces; se detiene en la primera que falla. */
fun entregarCopias(copias: Int, entregar: (copia: Int) -> ResultadoDeTrabajo): ResultadoDeTrabajo {
    val total = maxOf(1, copias)
    var bytes = 0
    var ultimo = ResultadoDeTrabajo.enviado(0)
    for (copia in 1..total) {
        ultimo = entregar(copia)
        if (!ultimo.ok) return ultimo
        bytes += ultimo.bytes ?: 0
    }
    return ultimo.copy(bytes = bytes)
}
