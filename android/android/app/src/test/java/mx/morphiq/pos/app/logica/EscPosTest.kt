package mx.morphiq.pos.app.logica

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EscPosTest {
    private fun bytes(vararg valores: Int) = ByteArray(valores.size) { valores[it].toByte() }

    @Test fun `el pulso del cajon es ESC p 0 25 250`() {
        assertArrayEquals(bytes(0x1B, 0x70, 0, 25, 250), EscPos.PULSO_CAJON)
    }

    @Test fun `el corte es GS V 66 0`() {
        assertArrayEquals(bytes(0x1D, 0x56, 66, 0), EscPos.CORTE)
    }

    @Test fun `la pagina de prueba empieza con ESC arroba, avanza 4 lineas y termina con el corte`() {
        val pagina = EscPos.paginaDePrueba("POS Don Poncho", "31/10/2026 14:05", "usb")
        assertArrayEquals(bytes(0x1B, 0x40), pagina.copyOfRange(0, 2))
        assertArrayEquals(EscPos.CORTE, pagina.copyOfRange(pagina.size - 4, pagina.size))
        assertArrayEquals(bytes(0x1B, 0x64, 4), pagina.copyOfRange(pagina.size - 7, pagina.size - 4))
    }

    @Test fun `la pagina de prueba lleva el nombre, la fecha, el texto y la conexion`() {
        val texto = String(EscPos.paginaDePrueba("POS Don Poncho", "31/10/2026 14:05", "red 10.0.0.9:9100"), Charsets.US_ASCII)
        assertTrue(texto.contains("POS Don Poncho\n"))
        assertTrue(texto.contains("31/10/2026 14:05\n"))
        assertTrue(texto.contains("Pagina de prueba\n"))
        assertTrue(texto.contains("Conexion: red 10.0.0.9:9100\n"))
    }

    @Test fun `la pagina de prueba es solo ASCII aunque el nombre lleve acentos`() {
        val pagina = EscPos.paginaDePrueba("Cafe Ñandú · Güero", "01/01/2027 00:00", "bluetooth")
        // Todos los bytes son ASCII (0..127): ni el nombre con acentos mete bytes altos.
        assertTrue("Hay bytes que no son ASCII", pagina.all { it.toInt() in 0..127 })
        assertTrue(String(pagina, Charsets.US_ASCII).contains("Cafe Nandu ? Guero"))
    }

    @Test fun `soloAscii quita acentos y cambia lo que no es ASCII por signo de interrogacion`() {
        assertEquals("Anos y cafe", EscPos.soloAscii("Años y café"))
        assertEquals("a?b", EscPos.soloAscii("a€b"))
        assertEquals("tab?", EscPos.soloAscii("tab\t"))
    }

    @Test fun `el renglon de reimpresion es texto simple con la fecha`() {
        assertEquals("*** REIMPRESION 31/10/2026 14:05 ***\n", String(EscPos.renglonDeReimpresion("31/10/2026 14:05"), Charsets.US_ASCII))
    }

    @Test fun `la reimpresion antepone el renglon al documento recordado`() {
        val documento = bytes(0x1B, 0x40, 0x41, 0x0A)
        val total = EscPos.reimpresion("31/10/2026 14:05", documento)
        val renglon = EscPos.renglonDeReimpresion("31/10/2026 14:05")
        assertArrayEquals(renglon, total.copyOfRange(0, renglon.size))
        assertArrayEquals(documento, total.copyOfRange(renglon.size, total.size))
    }

    @Test fun `la consulta de estado es DLE EOT n`() {
        assertArrayEquals(bytes(0x10, 0x04, 4), EscPos.consultaDeEstado(4))
    }

    @Test fun `el estado se lee de las tres respuestas`() {
        val bien = EscPos.decodificarEstado(0x12, 0x12, 0x12)
        assertEquals(true, bien.enLinea)
        assertEquals(false, bien.sinPapel)
        assertEquals(false, bien.tapaAbierta)

        assertEquals(false, EscPos.decodificarEstado(0x08, 0x00, 0x00).enLinea)
        assertEquals(true, EscPos.decodificarEstado(0x00, 0x04, 0x00).tapaAbierta)
        assertEquals(true, EscPos.decodificarEstado(0x00, 0x00, 0x60).sinPapel)
        assertEquals(true, EscPos.decodificarEstado(0x00, 0x20, 0x00).sinPapel)
    }

    @Test fun `sin respuesta no se inventa nada`() {
        val nada = EscPos.decodificarEstado(null, null, null)
        assertFalse(nada.contesto())
        assertNull(nada.enLinea)
        assertNull(nada.sinPapel)
        assertNull(nada.tapaAbierta)
        assertTrue(EscPos.decodificarEstado(0x12, null, null).contesto())
    }
}
