package mx.morphiq.pos.app.logica

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** DP-D125: la impresión por red sólo va a literales IP de la red local. */
class DireccionPrivadaTest {
    private fun assertPermitida(texto: String, literal: String = texto) {
        val evaluacion = DireccionPrivada.evaluar(texto)
        assertEquals("«$texto» debería permitirse", Veredicto.PERMITIDA, evaluacion.veredicto)
        assertEquals(literal, evaluacion.literal)
    }

    private fun assertRechazada(texto: String?, esperado: Veredicto) {
        val evaluacion = DireccionPrivada.evaluar(texto)
        assertEquals("«$texto»", esperado, evaluacion.veredicto)
        assertNull("«$texto» no debe devolver literal", evaluacion.literal)
    }

    @Test fun `las IPv4 privadas, de enlace local y loopback se permiten`() {
        listOf(
            "10.0.0.1", "10.255.255.254", "172.16.0.1", "172.31.255.254", "192.168.0.1", "192.168.1.50",
            "169.254.1.1", "127.0.0.1", "127.255.255.254",
        ).forEach { assertPermitida(it) }
    }

    @Test fun `las IPv4 publicas o reservadas fuera de la lista se rechazan como PUBLICA`() {
        listOf(
            "8.8.8.8", "1.1.1.1", "192.0.2.10", "172.15.255.255", "172.32.0.1", "192.167.1.1", "192.169.1.1",
            "169.253.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "11.0.0.1", "9.255.255.255",
        ).forEach { assertRechazada(it, Veredicto.PUBLICA) }
    }

    @Test fun `un nombre de host nunca se acepta`() {
        listOf("impresora.local", "localhost", "impresora-cocina", "ticket.example.com", "192.168.1.1.evil.com", "evil.com/192.168.1.1")
            .forEach { assertRechazada(it, Veredicto.NO_ES_LITERAL) }
    }

    @Test fun `las formas ambiguas de escribir una IPv4 se rechazan`() {
        // Octal, hexadecimal, entero, formas cortas, ceros a la izquierda: distintas librerías las leen distinto.
        listOf(
            "010.0.0.1", "0x7f.1", "0x7f.0.0.1", "2130706433", "127.1", "127.0.1", "192.168.001.001", "0177.0.0.1",
            "1.1.1.256", "1.1.1", "1.1.1.1.1", "+1.1.1.1", "-1.0.0.1", "1..1.1", ".1.1.1", "1.1.1.", "٠.٠.٠.١",
        ).forEach { assertRechazada(it, Veredicto.NO_ES_LITERAL) }
    }

    @Test fun `una IPv4 con puerto o con texto pegado no es una direccion`() {
        listOf("192.168.1.1:9100", "192.168.1.1 y otra", "http://192.168.1.1", "192.168.1.1/24", "192.168.1.1\n10.0.0.1")
            .forEach { assertRechazada(it, Veredicto.NO_ES_LITERAL) }
    }

    @Test fun `espacios alrededor se ignoran y corchetes se quitan`() {
        assertPermitida("  192.168.1.5 ", "192.168.1.5")
        assertPermitida("[::1]", "::1")
        assertPermitida("[fd00::5]", "fd00::5")
    }

    @Test fun `vacio o nulo es VACIA`() {
        assertRechazada(null, Veredicto.VACIA)
        assertRechazada("", Veredicto.VACIA)
        assertRechazada("   ", Veredicto.VACIA)
    }

    @Test fun `IPv6 loopback, ULA y enlace local se permiten`() {
        listOf("::1", "0:0:0:0:0:0:0:1", "fd00::1", "fc00::1", "fdff:ffff::1", "fe80::1", "fe80::1234:5678:9abc:def0", "febf::1", "FE80::A")
            .forEach { assertPermitida(it) }
    }

    @Test fun `una zona solo vale en direcciones de enlace local`() {
        assertPermitida("fe80::1%wlan0")
        assertPermitida("fe80::1%eth0")
        assertRechazada("fd00::1%wlan0", Veredicto.NO_ES_LITERAL)
        assertRechazada("2001:db8::1%wlan0", Veredicto.NO_ES_LITERAL)
        assertRechazada("fe80::1%", Veredicto.NO_ES_LITERAL)
        assertRechazada("fe80::1%wl an0", Veredicto.NO_ES_LITERAL)
    }

    @Test fun `IPv6 publicas, no especificada y sitio-local viejo se rechazan`() {
        listOf("2001:db8::1", "2606:4700:4700::1111", "::", "fec0::1", "fe00::1", "ff02::1", "64:ff9b::808:808", "::8.8.8.8", "1::")
            .forEach { assertRechazada(it, Veredicto.PUBLICA) }
    }

    @Test fun `una IPv4 mapeada en IPv6 se juzga por la IPv4 que lleva dentro`() {
        assertRechazada("::ffff:8.8.8.8", Veredicto.PUBLICA)
        assertRechazada("::ffff:808:808", Veredicto.PUBLICA)
        assertRechazada("0:0:0:0:0:ffff:8.8.8.8", Veredicto.PUBLICA)
        assertPermitida("::ffff:192.168.1.5")
        assertPermitida("::ffff:c0a8:0105")
        assertPermitida("::ffff:10.0.0.1")
        assertPermitida("::ffff:127.0.0.1")
    }

    @Test fun `un IPv6 mal escrito no es una direccion`() {
        listOf(
            "1::2::3", ":::1", "::1::", ":1", "1:", "12345::1", "g::1", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "::1.2.3",
            "::ffff:1.2.3.256", "::ffff:010.0.0.1", "fe80::1::2",
        ).forEach { assertRechazada(it, Veredicto.NO_ES_LITERAL) }
    }

    @Test fun `un texto larguisimo se rechaza sin analizarlo`() {
        assertRechazada("1".repeat(500) + ".1.1.1", Veredicto.NO_ES_LITERAL)
        assertRechazada("a:".repeat(100), Veredicto.NO_ES_LITERAL)
    }

    @Test fun `normalizar devuelve el literal o nulo`() {
        assertEquals("10.1.2.3", DireccionPrivada.normalizar(" 10.1.2.3 "))
        assertNull(DireccionPrivada.normalizar("8.8.8.8"))
    }

    @Test fun `exigir lanza NO_SOPORTADO con un mensaje claro en espanol`() {
        try {
            DireccionPrivada.exigir("8.8.8.8")
            fail("Debió rechazar")
        } catch (error: ErrorDeImpresora) {
            assertEquals(Codigo.NO_SOPORTADO, error.codigo)
            assertTrue(error.message!!.contains("red local"))
        }
        try {
            DireccionPrivada.exigir("impresora.local")
            fail("Debió rechazar")
        } catch (error: ErrorDeImpresora) {
            assertEquals(Codigo.NO_SOPORTADO, error.codigo)
            assertTrue(error.message!!.contains("dirección IP"))
        }
        assertEquals("192.168.1.9", DireccionPrivada.exigir("192.168.1.9"))
    }

    @Test fun `el transporte de red rechaza ANTES de abrir cualquier socket`() {
        for (host in listOf("8.8.8.8", "impresora.local", "::ffff:8.8.8.8", "2130706433", "0x7f.1")) {
            try {
                TransporteRed(host, 9100)
                fail("«$host» debió rechazarse")
            } catch (error: ErrorDeImpresora) {
                assertEquals(host, Codigo.NO_SOPORTADO, error.codigo)
            }
        }
        TransporteRed("127.0.0.1", 9100)
        TransporteRed("192.168.1.50", 9100)
    }
}
