package mx.morphiq.pos.app.logica

import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** Un transporte de mentiras: anota lo que se le manda y falla cuando se le pide. */
private class TransporteFalso(
    private val registro: MutableList<String>,
    private val fallos: MutableList<ErrorDeImpresora?> = mutableListOf(),
    private val alEnviar: () -> Unit = {},
) : Transporte {
    override fun enviar(bytes: ByteArray, opciones: OpcionesDeEnvio, alProgreso: (Int) -> Unit) {
        alEnviar()
        val fallo = if (fallos.isEmpty()) null else fallos.removeAt(0)
        if (fallo != null) throw fallo
        registro.add(String(bytes, Charsets.US_ASCII))
        alProgreso(bytes.size)
    }

    override fun consultarEstado(esperaMs: Long): EstadoEscPos = EstadoEscPos(null, null, null)
}

class ServicioDeImpresionTest {
    private val destino = Destino(Conexiones.RED, host = "10.0.0.9")
    private val entregados = Collections.synchronizedList(mutableListOf<String>())
    private val fallos = Collections.synchronizedList(mutableListOf<ErrorDeImpresora?>())
    private lateinit var cola: ColaDeImpresion
    private lateinit var servicio: ServicioDeImpresion

    @Before fun preparar() {
        cola = ColaDeImpresion()
        servicio = ServicioDeImpresion(cola, { TransporteFalso(entregados, fallos) })
    }

    @After fun apagar() = cola.apagar()

    private fun imprimir(id: String, texto: String, copias: Int = 1, destinoDelTrabajo: Destino = destino): ResultadoFinal {
        val espera = CountDownLatch(1)
        var resultado: ResultadoFinal? = null
        servicio.imprimir(
            TrabajoDeImpresion(id, destinoDelTrabajo, texto.toByteArray(Charsets.US_ASCII), copias),
            alProgreso = { _, _, _ -> },
            alTerminar = {
                resultado = it
                espera.countDown()
            },
        )
        assertTrue("El trabajo $id no terminó", espera.await(5, TimeUnit.SECONDS))
        return resultado!!
    }

    @Test fun `un trabajo entregado responde enviado con sus bytes`() {
        val r = imprimir("t1", "hola")
        assertTrue(r.resultado.ok)
        assertEquals(ResultadoDeTrabajo.ENVIADO, r.resultado.estado)
        assertEquals(4, r.resultado.bytes)
        assertEquals(listOf("hola"), entregados.toList())
    }

    @Test fun `los trabajos de una misma impresora salen en el orden en que llegaron`() {
        val terminados = CountDownLatch(5)
        val orden = Collections.synchronizedList(mutableListOf<String>())
        // El primero tarda: si la cola no respetara el orden, los demás lo rebasarían.
        val lento = ServicioDeImpresion(cola, { TransporteFalso(entregados, alEnviar = { if (entregados.isEmpty()) Thread.sleep(150) }) })
        for (n in 1..5) {
            lento.imprimir(TrabajoDeImpresion("orden-$n", destino, "n$n".toByteArray()), { _, _, _ -> }) {
                orden.add(it.id)
                terminados.countDown()
            }
        }
        assertTrue(terminados.await(5, TimeUnit.SECONDS))
        assertEquals(listOf("orden-1", "orden-2", "orden-3", "orden-4", "orden-5"), orden.toList())
        assertEquals(listOf("n1", "n2", "n3", "n4", "n5"), entregados.toList())
    }

    @Test fun `un trabajo a la vez por impresora, pero impresoras distintas no se esperan`() {
        val dentro = java.util.concurrent.atomic.AtomicInteger(0)
        val maximoMismaImpresora = java.util.concurrent.atomic.AtomicInteger(0)
        val terminados = CountDownLatch(4)
        val medidor = ServicioDeImpresion(cola, {
            TransporteFalso(entregados, alEnviar = {
                val ahora = dentro.incrementAndGet()
                maximoMismaImpresora.accumulateAndGet(ahora) { a, b -> maxOf(a, b) }
                Thread.sleep(40)
                dentro.decrementAndGet()
            })
        })
        repeat(4) { n -> medidor.imprimir(TrabajoDeImpresion("m-$n", destino, "x".toByteArray()), { _, _, _ -> }) { terminados.countDown() } }
        assertTrue(terminados.await(5, TimeUnit.SECONDS))
        assertEquals("Nunca dos trabajos a la vez en la misma impresora", 1, maximoMismaImpresora.get())
    }

    @Test fun `un id repetido ya entregado responde duplicado y no imprime`() {
        imprimir("repetido", "uno")
        val segundo = imprimir("repetido", "dos")
        assertTrue(segundo.resultado.ok)
        assertEquals(ResultadoDeTrabajo.DUPLICADO, segundo.resultado.estado)
        assertEquals(listOf("uno"), entregados.toList())
    }

    @Test fun `un trabajo que fallo se reintenta con el mismo id y si imprime`() {
        fallos.add(ErrorDeImpresora(Codigo.DESCONECTADA, "Impresora desconectada"))
        val primero = imprimir("reintento", "ticket")
        assertFalse(primero.resultado.ok)
        assertEquals(Codigo.DESCONECTADA, primero.resultado.codigo)
        assertEquals("Impresora desconectada", primero.resultado.mensaje)
        assertTrue(entregados.isEmpty())

        val segundo = imprimir("reintento", "ticket")
        assertTrue(segundo.resultado.ok)
        assertEquals(ResultadoDeTrabajo.ENVIADO, segundo.resultado.estado)
        assertEquals(listOf("ticket"), entregados.toList())
    }

    @Test fun `las copias repiten el documento`() {
        val r = imprimir("copias", "ab", copias = 3)
        assertTrue(r.resultado.ok)
        assertEquals(listOf("ab", "ab", "ab"), entregados.toList())
        assertEquals(6, r.resultado.bytes)
    }

    @Test fun `si una copia falla se detiene y avisa`() {
        fallos.add(null)
        fallos.add(ErrorDeImpresora(Codigo.SIN_PAPEL, "Sin papel"))
        val r = imprimir("copia-falla", "ab", copias = 3)
        assertFalse(r.resultado.ok)
        assertEquals(Codigo.SIN_PAPEL, r.resultado.codigo)
        assertEquals(listOf("ab"), entregados.toList())
    }

    @Test fun `solo se recuerdan los ultimos 50 ids entregados`() {
        for (n in 1..(ColaDeImpresion.MEMORIA + 1)) imprimir("id-$n", "x")
        val antiguo = imprimir("id-1", "otra vez")
        assertEquals("El id más viejo ya se olvidó y vuelve a imprimir", ResultadoDeTrabajo.ENVIADO, antiguo.resultado.estado)
        val reciente = imprimir("id-${ColaDeImpresion.MEMORIA + 1}", "otra vez")
        assertEquals(ResultadoDeTrabajo.DUPLICADO, reciente.resultado.estado)
    }

    @Test fun `un error inesperado se traduce y no rompe la cola`() {
        val roto = ServicioDeImpresion(cola, { throw IllegalStateException("boom") })
        val espera = CountDownLatch(1)
        var resultado: ResultadoFinal? = null
        roto.imprimir(TrabajoDeImpresion("roto", destino, "x".toByteArray()), { _, _, _ -> }) {
            resultado = it
            espera.countDown()
        }
        assertTrue(espera.await(5, TimeUnit.SECONDS))
        assertFalse(resultado!!.resultado.ok)
        assertEquals(Codigo.DESCONOCIDO, resultado!!.resultado.codigo)
        assertEquals("Después de un error la cola sigue sirviendo", ResultadoDeTrabajo.ENVIADO, imprimir("despues", "ok").resultado.estado)
    }

    @Test fun `el progreso avanza hasta el total de todas las copias`() {
        val progreso = Collections.synchronizedList(mutableListOf<Pair<Int, Int>>())
        val espera = CountDownLatch(1)
        servicio.imprimir(TrabajoDeImpresion("prog", destino, "abcd".toByteArray(), copias = 2), { _, enviados, total -> progreso.add(enviados to total) }) {
            espera.countDown()
        }
        assertTrue(espera.await(5, TimeUnit.SECONDS))
        assertEquals(listOf(4 to 8, 8 to 8), progreso.toList())
    }

    @Test fun `el registro de entregados sobrevive a una cola nueva`() {
        val registro = RegistroEnMemoria()
        val primera = ColaDeImpresion(registro)
        val sPrimera = ServicioDeImpresion(primera, { TransporteFalso(entregados) })
        val espera = CountDownLatch(1)
        sPrimera.imprimir(TrabajoDeImpresion("persistente", destino, "x".toByteArray()), { _, _, _ -> }) { espera.countDown() }
        assertTrue(espera.await(5, TimeUnit.SECONDS))
        primera.apagar()

        val segunda = ColaDeImpresion(registro, { Executors.newSingleThreadExecutor() })
        val sSegunda = ServicioDeImpresion(segunda, { TransporteFalso(entregados) })
        val otra = CountDownLatch(1)
        var resultado: ResultadoFinal? = null
        sSegunda.imprimir(TrabajoDeImpresion("persistente", destino, "y".toByteArray()), { _, _, _ -> }) {
            resultado = it
            otra.countDown()
        }
        assertTrue(otra.await(5, TimeUnit.SECONDS))
        segunda.apagar()
        assertEquals(ResultadoDeTrabajo.DUPLICADO, resultado!!.resultado.estado)
    }
}
