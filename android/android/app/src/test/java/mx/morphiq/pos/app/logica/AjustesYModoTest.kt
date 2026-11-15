package mx.morphiq.pos.app.logica

import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AjustesMezclaTest {
    @Test fun `por omision trae version 1, perfil nulo, modo automatico y primer arranque pendiente`() {
        val base = AjustesMezcla.porOmision()
        assertEquals(1, base.getInt("version"))
        assertTrue(base.isNull("perfil"))
        assertTrue(base.isNull("modoLigero"))
        assertFalse(base.getBoolean(AjustesMezcla.PRIMER_ARRANQUE_HECHO))
    }

    @Test fun `la mezcla es superficial y cada llave del parche reemplaza a la de lo guardado`() {
        val actual = JSONObject("""{"version":1,"perfil":{"nombre":"A","destino":{"conexion":"red","host":"1.1.1.1"}},"modoLigero":null,"propia":"x"}""")
        val parche = JSONObject("""{"perfil":{"nombre":"B"},"otra":5}""")
        val resultado = AjustesMezcla.mezclar(actual, parche)
        assertEquals("B", resultado.getJSONObject("perfil").getString("nombre"))
        assertFalse("No mezcla por dentro: el destino de A desaparece", resultado.getJSONObject("perfil").has("destino"))
        assertEquals("x", resultado.getString("propia"))
        assertEquals(5, resultado.getInt("otra"))
    }

    @Test fun `la mezcla no cambia lo que ya estaba guardado`() {
        val actual = JSONObject("""{"version":1,"propia":"x"}""")
        AjustesMezcla.mezclar(actual, JSONObject("""{"propia":"y"}"""))
        assertEquals("x", actual.getString("propia"))
    }

    @Test fun `la version siempre queda en 1 aunque el parche diga otra cosa`() {
        assertEquals(1, AjustesMezcla.mezclar(AjustesMezcla.porOmision(), JSONObject("""{"version":99}""")).getInt("version"))
    }

    @Test fun `un parche con null deja la llave en null`() {
        val resultado = AjustesMezcla.mezclar(JSONObject("""{"modoLigero":true}"""), JSONObject("""{"modoLigero":null}"""))
        assertNull(AjustesMezcla.modoLigeroManual(resultado))
    }

    @Test fun `un texto guardado dañado o vacio cae a los valores por omision`() {
        assertEquals(1, AjustesMezcla.desdeTexto("{roto").getInt("version"))
        assertEquals(1, AjustesMezcla.desdeTexto(null).getInt("version"))
        assertEquals(1, AjustesMezcla.desdeTexto("  ").getInt("version"))
    }

    @Test fun `lo guardado conserva sus llaves y completa las que falten`() {
        val leido = AjustesMezcla.desdeTexto("""{"version":1,"propia":"x"}""")
        assertEquals("x", leido.getString("propia"))
        assertTrue(leido.has("perfil"))
        assertTrue(leido.has("modoLigero"))
    }

    @Test fun `el destino y el cajon del perfil se leen`() {
        val ajustes = JSONObject("""{"perfil":{"destino":{"conexion":"usb","vendorId":1155,"productId":22339},"cajon":{"base64":"G3AAGfo="}}}""")
        assertEquals("usb", AjustesMezcla.perfilDestino(ajustes)!!.getString("conexion"))
        assertEquals("G3AAGfo=", AjustesMezcla.perfilCajonBase64(ajustes))
        assertNull(AjustesMezcla.perfilDestino(AjustesMezcla.porOmision()))
        assertNull(AjustesMezcla.perfilCajonBase64(JSONObject("""{"perfil":{"cajon":null}}""")))
    }

    @Test fun `el modo ligero manual distingue true, false y automatico`() {
        assertEquals(true, AjustesMezcla.modoLigeroManual(JSONObject("""{"modoLigero":true}""")))
        assertEquals(false, AjustesMezcla.modoLigeroManual(JSONObject("""{"modoLigero":false}""")))
        assertNull(AjustesMezcla.modoLigeroManual(JSONObject("""{"modoLigero":null}""")))
        assertNull(AjustesMezcla.modoLigeroManual(JSONObject("{}")))
    }
}

class ModoLigeroTest {
    private val mb = 1024L

    @Test fun `un aparato con 3 GB o menos de RAM es ligero`() {
        val d = ModoLigero.decidir(null, ramTotalMb = 3 * mb, nucleos = 8, aparatoDeRamBaja = false)
        assertTrue(d.activo)
        assertEquals("auto", d.origen)
        assertTrue(d.motivo.contains("RAM"))
    }

    @Test fun `con mas de 3 GB, mas de 4 nucleos y RAM normal NO es ligero`() {
        val d = ModoLigero.decidir(null, ramTotalMb = 3 * mb + 1, nucleos = 5, aparatoDeRamBaja = false)
        assertFalse(d.activo)
        assertEquals("auto", d.origen)
    }

    @Test fun `con 4 nucleos o menos es ligero aunque sobre la RAM`() {
        assertTrue(ModoLigero.decidir(null, 8 * mb, 4, false).activo)
        assertTrue(ModoLigero.decidir(null, 8 * mb, 2, false).activo)
        assertFalse(ModoLigero.decidir(null, 8 * mb, 5, false).activo)
    }

    @Test fun `Android marcando poca RAM lo vuelve ligero`() {
        val d = ModoLigero.decidir(null, 8 * mb, 8, aparatoDeRamBaja = true)
        assertTrue(d.activo)
        assertTrue(d.motivo.contains("poca memoria"))
    }

    @Test fun `el ajuste manual manda sobre lo automatico`() {
        val encendido = ModoLigero.decidir(true, 16 * mb, 16, false)
        assertTrue(encendido.activo)
        assertEquals("manual", encendido.origen)
        val apagado = ModoLigero.decidir(false, 1 * mb, 1, true)
        assertFalse(apagado.activo)
        assertEquals("manual", apagado.origen)
    }

    @Test fun `un dato que no se pudo leer (cero) no dispara el modo ligero`() {
        assertFalse(ModoLigero.decidir(null, ramTotalMb = 0, nucleos = 0, aparatoDeRamBaja = false).activo)
    }

    @Test fun `el motivo junta todas las razones`() {
        val d = ModoLigero.decidir(null, 2 * mb, 2, true)
        assertTrue(d.motivo.contains("poca memoria") && d.motivo.contains("RAM") && d.motivo.contains("núcleos"))
    }
}

class TraductorDeErroresTest {
    private fun traducir(e: Throwable, espera: Long = 10_000) = TraductorDeErrores.traducir(e, espera)

    @Test fun `un tiempo agotado dice cuantos segundos`() {
        val e = traducir(SocketTimeoutException("timeout"), 10_000)
        assertEquals(Codigo.TIEMPO, e.codigo)
        assertEquals("No respondió en 10 s", e.message)
        assertEquals("No respondió en 1.5 s", traducir(SocketTimeoutException(), 1500).message)
    }

    @Test fun `no poder conectar es impresora desconectada`() {
        for (error in listOf(ConnectException("refused"), UnknownHostException("x"), java.net.NoRouteToHostException("x"))) {
            val e = traducir(error)
            assertEquals(Codigo.DESCONECTADA, e.codigo)
            assertEquals("Impresora desconectada", e.message)
        }
    }

    @Test fun `una conexion que se cae a medio envio es impresora desconectada`() {
        assertEquals(Codigo.DESCONECTADA, traducir(IOException("Broken pipe")).codigo)
        assertEquals(Codigo.DESCONECTADA, traducir(IOException("Connection reset by peer")).codigo)
        assertEquals(Codigo.DESCONECTADA, traducir(IOException("socket closed")).codigo)
    }

    @Test fun `la falta de un permiso se traduce a SIN_PERMISO`() {
        assertEquals(Codigo.SIN_PERMISO, traducir(SecurityException("BLUETOOTH_CONNECT")).codigo)
    }

    @Test fun `una interrupcion es CANCELADO`() {
        assertEquals(Codigo.CANCELADO, traducir(InterruptedException()).codigo)
    }

    @Test fun `lo desconocido nunca deja pasar el texto tecnico`() {
        val e = traducir(IllegalStateException("java.lang.NullPointerException en Foo.kt:42"))
        assertEquals(Codigo.DESCONOCIDO, e.codigo)
        assertEquals("No se pudo imprimir", e.message)
        assertEquals(Codigo.DESCONOCIDO, traducir(IOException("algo raro")).codigo)
    }

    @Test fun `un ErrorDeImpresora ya traducido pasa tal cual`() {
        val original = ErrorDeImpresora(Codigo.SIN_PAPEL, "Sin papel")
        assertTrue(traducir(original) === original)
    }

    @Test fun `el estado de la impresora se traduce a su error`() {
        assertEquals(Codigo.SIN_PAPEL, TraductorDeErrores.desdeEstado(EstadoEscPos(true, true, false))!!.codigo)
        assertEquals("Sin papel", TraductorDeErrores.desdeEstado(EstadoEscPos(true, true, false))!!.message)
        assertEquals(Codigo.TAPA_ABIERTA, TraductorDeErrores.desdeEstado(EstadoEscPos(true, false, true))!!.codigo)
        assertEquals(Codigo.DESCONECTADA, TraductorDeErrores.desdeEstado(EstadoEscPos(false, false, false))!!.codigo)
        assertNull(TraductorDeErrores.desdeEstado(EstadoEscPos(true, false, false)))
        assertNull(TraductorDeErrores.desdeEstado(EstadoEscPos(null, null, null)))
    }

    @Test fun `los segundos se escriben sin ceros de mas`() {
        assertEquals("10", TraductorDeErrores.segundos(10_000))
        assertEquals("0.4", TraductorDeErrores.segundos(400))
        assertEquals("2.5", TraductorDeErrores.segundos(2500))
    }
}

class DestinoTest {
    @Test fun `la clave de la cola distingue impresoras y no distingue mayusculas`() {
        assertEquals("red:10.0.0.9:9100", Destino(Conexiones.RED, host = "10.0.0.9").clave())
        assertEquals("red:impresora.local:9101", Destino(Conexiones.RED, host = "Impresora.Local", puerto = 9101).clave())
        assertEquals("usb:1155:22339", Destino(Conexiones.USB, vendorId = 1155, productId = 22339).clave())
        assertEquals("bluetooth:00:11:22:33:44:55", Destino(Conexiones.BLUETOOTH, direccion = "00:11:22:33:44:55").clave())
        assertEquals(Destino(Conexiones.BLUETOOTH, direccion = "aa:bb:cc:dd:ee:ff").clave(), Destino(Conexiones.BLUETOOTH, direccion = "AA:BB:CC:DD:EE:FF").clave())
    }

    @Test fun `se lee del JSON del contrato`() {
        val d = Destino.desdeJson(JSONObject("""{"conexion":"red","host":"10.0.0.9","puerto":9100}"""))!!
        assertEquals(Destino(Conexiones.RED, host = "10.0.0.9", puerto = 9100), d)
        assertNull(Destino.desdeJson(null))
        assertNull(Destino.desdeJson(JSONObject("{}")))
    }

    @Test fun `avisa que falta cuando el destino esta incompleto`() {
        assertEquals(null, Destino.faltante(Destino(Conexiones.RED, host = "10.0.0.9")))
        assertTrue(Destino.faltante(Destino(Conexiones.RED))!!.isNotEmpty())
        assertTrue(Destino.faltante(Destino(Conexiones.USB, vendorId = 1))!!.isNotEmpty())
        assertTrue(Destino.faltante(Destino(Conexiones.BLUETOOTH))!!.isNotEmpty())
        assertTrue(Destino.faltante(Destino("spooler"))!!.isNotEmpty())
    }

    @Test fun `las conexiones de Windows dicen por que no existen`() {
        assertTrue(Conexiones.SOLO_WINDOWS.keys.containsAll(listOf("spooler", "driver", "serial")))
        assertTrue(Conexiones.SOLO_WINDOWS.values.all { it.contains("Windows") })
    }

    @Test fun `la InnerPrinter se reconoce por su nombre`() {
        assertTrue(InnerPrinter.esPorNombre("InnerPrinter"))
        assertTrue(InnerPrinter.esPorNombre("innerprinter"))
        assertTrue(InnerPrinter.esPorNombre("Inner Printer"))
        assertFalse(InnerPrinter.esPorNombre("Mi impresora"))
        assertFalse(InnerPrinter.esPorNombre(null))
        assertFalse(InnerPrinter.esPorNombre("Printer InnerPrinter2000 clon"))
    }
}
