package mx.morphiq.pos.app.logica

import java.io.ByteArrayOutputStream
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class TransporteRedTest {
    private val servidores = mutableListOf<ServerSocket>()

    @After fun cerrar() = servidores.forEach { it.close() }

    private fun servidor(): ServerSocket = ServerSocket(0).also { servidores.add(it) }

    /** Atiende UNA conexión: lee todo hasta que el cliente cierra y lo deja en [recibido]. */
    private fun recibirUna(servidor: ServerSocket, recibido: AtomicReference<ByteArray>, listo: CountDownLatch) = Thread {
        servidor.accept().use { socket ->
            val salida = ByteArrayOutputStream()
            socket.getInputStream().copyTo(salida)
            recibido.set(salida.toByteArray())
        }
        listo.countDown()
    }.apply { isDaemon = true; start() }

    @Test fun `entrega todos los bytes y los reporta por bloques`() {
        val servidor = servidor()
        val recibido = AtomicReference<ByteArray>()
        val listo = CountDownLatch(1)
        recibirUna(servidor, recibido, listo)
        val documento = ByteArray(10_000) { (it % 251).toByte() }
        val avances = mutableListOf<Int>()

        TransporteRed("127.0.0.1", servidor.localPort).enviar(documento, OpcionesDeEnvio(bloqueBytes = 4096, esperaMs = 2000)) { avances.add(it) }

        assertTrue(listo.await(5, TimeUnit.SECONDS))
        assertArrayEquals(documento, recibido.get())
        assertEquals("Tres bloques: 4096, 4096 y 1808", listOf(4096, 8192, 10_000), avances)
    }

    @Test fun `un bloque mas chico que el documento hace mas entregas`() {
        val servidor = servidor()
        val recibido = AtomicReference<ByteArray>()
        val listo = CountDownLatch(1)
        recibirUna(servidor, recibido, listo)
        val avances = mutableListOf<Int>()

        TransporteRed("127.0.0.1", servidor.localPort).enviar(ByteArray(10) { it.toByte() }, OpcionesDeEnvio(bloqueBytes = 4, esperaMs = 2000)) { avances.add(it) }

        assertTrue(listo.await(5, TimeUnit.SECONDS))
        assertEquals(listOf(4, 8, 10), avances)
        assertEquals(10, recibido.get().size)
    }

    @Test fun `la pausa entre bloques se respeta`() {
        val servidor = servidor()
        val recibido = AtomicReference<ByteArray>()
        val listo = CountDownLatch(1)
        recibirUna(servidor, recibido, listo)

        val inicio = System.nanoTime()
        TransporteRed("127.0.0.1", servidor.localPort).enviar(ByteArray(9), OpcionesDeEnvio(bloqueBytes = 3, pausaMs = 60, esperaMs = 2000)) {}
        val ms = (System.nanoTime() - inicio) / 1_000_000

        assertTrue("Dos pausas de 60 ms entre tres bloques (tardó $ms ms)", ms >= 110)
        assertTrue(listo.await(5, TimeUnit.SECONDS))
    }

    @Test fun `una impresora que no existe responde desconectada`() {
        val puertoCerrado = ServerSocket(0).use { it.localPort }
        try {
            TransporteRed("127.0.0.1", puertoCerrado).enviar(ByteArray(1), OpcionesDeEnvio(esperaMs = 1000)) {}
            fail("Debió fallar")
        } catch (error: ErrorDeImpresora) {
            assertEquals(Codigo.DESCONECTADA, error.codigo)
            assertEquals("Impresora desconectada", error.message)
        }
    }

    @Test fun `una direccion que no resuelve responde desconectada`() {
        try {
            TransporteRed("impresora-que-no-existe.invalid", 9100).enviar(ByteArray(1), OpcionesDeEnvio(esperaMs = 1000)) {}
            fail("Debió fallar")
        } catch (error: ErrorDeImpresora) {
            assertEquals(Codigo.DESCONECTADA, error.codigo)
        }
    }

    @Test fun `el estado se lee con DLE EOT 1 2 4 y la impresora contesta un byte cada vez`() {
        val servidor = servidor()
        val consultas = ByteArrayOutputStream()
        val respuestas = intArrayOf(0x12, 0x00, 0x60)
        Thread {
            servidor.accept().use { socket ->
                val entrada = socket.getInputStream()
                val salida = socket.getOutputStream()
                for (respuesta in respuestas) {
                    val consulta = ByteArray(3)
                    var leidos = 0
                    while (leidos < 3) leidos += entrada.read(consulta, leidos, 3 - leidos)
                    consultas.write(consulta)
                    salida.write(respuesta)
                    salida.flush()
                }
            }
        }.apply { isDaemon = true; start() }

        val estado = TransporteRed("127.0.0.1", servidor.localPort).consultarEstado(2000)

        assertArrayEquals(byteArrayOf(0x10, 4, 1, 0x10, 4, 2, 0x10, 4, 4), consultas.toByteArray())
        assertEquals(true, estado.enLinea)
        assertEquals(true, estado.sinPapel)
        assertEquals(false, estado.tapaAbierta)
    }

    @Test fun `una impresora que no contesta el estado no inventa nada`() {
        val servidor = servidor()
        Thread { servidor.accept().use { Thread.sleep(800) } }.apply { isDaemon = true; start() }

        val estado = TransporteRed("127.0.0.1", servidor.localPort).consultarEstado(150)

        assertFalse(estado.contesto())
        assertNull(estado.enLinea)
    }

    @Test fun `si la impresora no recibe a tiempo se responde TIEMPO con el mensaje en segundos`() {
        val servidor = servidor()
        // Acepta la conexión pero nunca lee: el buffer del socket se llena y la escritura se bloquea.
        val retener = CountDownLatch(1)
        Thread { servidor.accept().use { retener.await(10, TimeUnit.SECONDS) } }.apply { isDaemon = true; start() }

        try {
            TransporteRed("127.0.0.1", servidor.localPort).enviar(ByteArray(64 * 1024 * 1024), OpcionesDeEnvio(bloqueBytes = 1 shl 20, esperaMs = 400)) {}
            fail("Debió agotar el tiempo")
        } catch (error: ErrorDeImpresora) {
            assertEquals(Codigo.TIEMPO, error.codigo)
            assertEquals("No respondió en 0.4 s", error.message)
        } finally {
            retener.countDown()
        }
    }
}
