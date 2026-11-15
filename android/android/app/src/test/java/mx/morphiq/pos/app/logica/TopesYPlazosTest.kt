package mx.morphiq.pos.app.logica

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TopesTest {
    @Test fun `un ticket largo de 80 mm rasterizado cabe con holgura`() {
        // 576 puntos de ancho = 72 bytes por fila; 60 cm de papel a 8 puntos/mm = 4800 filas.
        val ticketLargo = 72 * 4800
        assertTrue(ticketLargo < Topes.MAX_BYTES_DOCUMENTO / 10)
        assertTrue(Topes.base64Cabe((ticketLargo + 2) / 3 * 4, Topes.MAX_BYTES_DOCUMENTO))
    }

    @Test fun `el tope de un documento es de 4 MB y se mide sobre el base64 sin decodificar`() {
        val maxCaracteres = Topes.maxCaracteresBase64(Topes.MAX_BYTES_DOCUMENTO)
        assertEquals(4 * 1024 * 1024 / 3 * 4 + 4, maxCaracteres)
        assertTrue(Topes.base64Cabe(maxCaracteres, Topes.MAX_BYTES_DOCUMENTO))
        assertFalse(Topes.base64Cabe(maxCaracteres + 1, Topes.MAX_BYTES_DOCUMENTO))
        assertTrue(Topes.base64Cabe(0, Topes.MAX_BYTES_DOCUMENTO))
    }

    @Test fun `el pulso del cajon tiene su propio tope chico`() {
        assertTrue(Topes.base64Cabe(8, Topes.MAX_BYTES_PULSO))
        assertFalse(Topes.base64Cabe(5_000, Topes.MAX_BYTES_PULSO))
    }

    @Test fun `unos ajustes normales caben y unos enormes no`() {
        val normales = JSONObject("""{"version":1,"perfil":{"nombre":"Cocina","destino":{"conexion":"red","host":"192.168.1.50"}},"modoLigero":null}""")
        assertTrue(Topes.ajustesCaben(normales))
        val enormes = JSONObject().put("basura", "x".repeat(Topes.MAX_BYTES_AJUSTES + 1))
        assertFalse(Topes.ajustesCaben(enormes))
    }

    @Test fun `los ajustes se miden en bytes UTF-8 y no en caracteres`() {
        // Cada «ñ» pesa 2 bytes: 40 000 caracteres son ~80 000 bytes, más que el tope de 64 KiB.
        val acentos = JSONObject().put("texto", "ñ".repeat(40_000))
        assertTrue(acentos.toString().length < Topes.MAX_BYTES_AJUSTES)
        assertFalse(Topes.ajustesCaben(acentos))
    }

    @Test fun `una llamada completa se acota antes de leerla como JSON`() {
        assertTrue(Topes.llamadaCabe(1_000))
        assertTrue(Topes.llamadaCabe(Topes.MAX_CARACTERES_LLAMADA))
        assertFalse(Topes.llamadaCabe(Topes.MAX_CARACTERES_LLAMADA + 1))
        // Dos documentos al tope (el que se imprime y el que se recuerda) siguen cabiendo.
        assertTrue(Topes.llamadaCabe(2 * Topes.maxCaracteresBase64(Topes.MAX_BYTES_DOCUMENTO) + 100))
    }

    @Test fun `el tope se escribe como lo lee una persona`() {
        assertEquals("4 MB", Topes.legible(Topes.MAX_BYTES_DOCUMENTO))
        assertEquals("64 KB", Topes.legible(Topes.MAX_BYTES_AJUSTES))
        assertEquals("1 KB", Topes.legible(Topes.MAX_BYTES_PULSO))
    }
}

class PlazoDeEnvioTest {
    private val porOmision = OpcionesDeEnvio()

    @Test fun `un ticket normal tiene decenas de segundos y no minutos`() {
        val total = PlazoDeEnvio.totalMs(20_000, porOmision)
        assertTrue("fue $total", total in 10_000..30_000)
    }

    @Test fun `nunca baja de la espera de un bloque`() {
        assertEquals(10_000, PlazoDeEnvio.totalMs(0, porOmision))
        assertEquals(10_000, PlazoDeEnvio.totalMs(1, porOmision))
    }

    @Test fun `crece con el tamano y con las pausas`() {
        val chico = PlazoDeEnvio.totalMs(100_000, porOmision)
        val grande = PlazoDeEnvio.totalMs(400_000, porOmision)
        val conPausa = PlazoDeEnvio.totalMs(100_000, OpcionesDeEnvio(pausaMs = 100))
        assertTrue(grande > chico)
        assertTrue(conPausa > chico)
    }

    @Test fun `ningun envio pasa del tope absoluto de 5 minutos`() {
        assertEquals(PlazoDeEnvio.TOPE_ABSOLUTO_MS, PlazoDeEnvio.totalMs(Topes.MAX_BYTES_DOCUMENTO, porOmision))
        assertEquals(PlazoDeEnvio.TOPE_ABSOLUTO_MS, PlazoDeEnvio.totalMs(10_000_000, OpcionesDeEnvio(bloqueBytes = 1, pausaMs = 10_000)))
        assertEquals(300_000, PlazoDeEnvio.TOPE_ABSOLUTO_MS)
    }

    @Test fun `la inactividad permitida suma el bloque, su pausa y el margen`() {
        assertEquals(11_000, PlazoDeEnvio.inactividadMs(porOmision))
        assertEquals(10_000 + 500 + 1_000, PlazoDeEnvio.inactividadMs(OpcionesDeEnvio(pausaMs = 500)))
    }
}

class VigilanteConPlazoTotalTest {
    @Test fun `un envio que sigue avanzando pero se pasa del plazo total se corta`() {
        val corto = CountDownLatch(1)
        val vigilante = VigilanteDeTiempo(esperaMs = 5_000, plazoTotalMs = 300) { corto.countDown() }.iniciar()
        // Late sin parar: la inactividad nunca se cumple, sólo el plazo total.
        val hilo = Thread {
            while (!corto.await(20, TimeUnit.MILLISECONDS)) vigilante.latir()
        }.apply { isDaemon = true; start() }

        assertTrue("Debió cortarse por el plazo total", corto.await(3, TimeUnit.SECONDS))
        assertTrue(vigilante.agotado)
        assertEquals(0, vigilante.restanteMs())
        vigilante.close()
        hilo.join(1000)
    }

    @Test fun `un envio atorado se corta por inactividad mucho antes del plazo total`() {
        val corto = CountDownLatch(1)
        val inicio = System.nanoTime()
        val vigilante = VigilanteDeTiempo(esperaMs = 150, plazoTotalMs = 60_000) { corto.countDown() }.iniciar()
        assertTrue(corto.await(3, TimeUnit.SECONDS))
        val ms = (System.nanoTime() - inicio) / 1_000_000
        assertTrue("tardó $ms ms", ms < 5_000)
        assertTrue(vigilante.agotado)
        vigilante.close()
    }

    @Test fun `un envio que termina a tiempo no dispara nada`() {
        val disparos = AtomicInteger()
        val vigilante = VigilanteDeTiempo(esperaMs = 5_000, plazoTotalMs = 5_000) { disparos.incrementAndGet() }.iniciar()
        Thread.sleep(120)
        vigilante.close()
        Thread.sleep(120)
        assertEquals(0, disparos.get())
        assertFalse(vigilante.agotado)
        assertTrue(vigilante.restanteMs() in 1..5_000)
    }

    @Test fun `sin plazo total el restante es ilimitado`() {
        val vigilante = VigilanteDeTiempo(esperaMs = 5_000) {}
        assertEquals(Long.MAX_VALUE, vigilante.restanteMs())
    }
}
