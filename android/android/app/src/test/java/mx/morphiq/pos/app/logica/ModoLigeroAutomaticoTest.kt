package mx.morphiq.pos.app.logica

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** El modo ligero automático: debe encenderse solo en un aparato como el iMin D4-503 y respetar la elección manual. */
class ModoLigeroAutomaticoTest {
    private val mb = 1024L

    /** Lo que reporta el iMin D4-503: RK3288 (4 núcleos), ~2 GB, sólo 32 bits y un WebView 99-103. */
    private fun imin(manual: Boolean? = null, webView: Int? = 99) =
        ModoLigero.decidir(manual, ramTotalMb = 1900, nucleos = 4, aparatoDeRamBaja = false, soloAbi32 = true, webViewMayor = webView)

    @Test fun `el iMin D4-503 enciende el modo ligero solo y dice por que`() {
        val d = imin()
        assertTrue(d.activo)
        assertEquals("auto", d.origen)
        assertTrue(d.motivo, d.motivo.contains("RAM") && d.motivo.contains("núcleos") && d.motivo.contains("32 bits") && d.motivo.contains("WebView"))
    }

    @Test fun `un telefono moderno de 8 GB, 8 nucleos, 64 bits y WebView reciente NO es ligero`() {
        val d = ModoLigero.decidir(null, 8 * mb, 8, false, soloAbi32 = false, webViewMayor = 130)
        assertFalse(d.activo)
        assertEquals("auto", d.origen)
    }

    @Test fun `ser de 32 bits basta por si solo`() {
        assertTrue(ModoLigero.decidir(null, 8 * mb, 8, false, soloAbi32 = true, webViewMayor = 130).activo)
    }

    @Test fun `un WebView anterior al 111 basta por si solo y el 111 ya no`() {
        assertTrue(ModoLigero.decidir(null, 8 * mb, 8, false, webViewMayor = 110).activo)
        assertTrue(ModoLigero.decidir(null, 8 * mb, 8, false, webViewMayor = 103).activo)
        assertFalse(ModoLigero.decidir(null, 8 * mb, 8, false, webViewMayor = 111).activo)
        assertFalse(ModoLigero.decidir(null, 8 * mb, 8, false, webViewMayor = 140).activo)
    }

    @Test fun `una version de WebView que no se pudo leer no enciende nada`() {
        assertFalse(ModoLigero.decidir(null, 8 * mb, 8, false, webViewMayor = null).activo)
        assertFalse(ModoLigero.decidir(null, 8 * mb, 8, false, webViewMayor = 0).activo)
    }

    @Test fun `la eleccion manual SIEMPRE se respeta, aunque el aparato sea un iMin`() {
        val apagado = imin(manual = false)
        assertFalse(apagado.activo)
        assertEquals("manual", apagado.origen)
        val encendido = ModoLigero.decidir(true, 16 * mb, 16, false, soloAbi32 = false, webViewMayor = 140)
        assertTrue(encendido.activo)
        assertEquals("manual", encendido.origen)
    }

    @Test fun `los umbrales son los documentados`() {
        assertEquals(3 * 1024L, ModoLigero.RAM_MAXIMA_MB)
        assertEquals(4, ModoLigero.NUCLEOS_MAXIMOS)
        assertEquals(111, ModoLigero.WEBVIEW_MAYOR_MINIMO)
    }

    @Test fun `solo hay 32 bits cuando hay ABIs y ninguna es de 64`() {
        assertTrue(ModoLigero.soloAbi32(listOf("armeabi-v7a", "armeabi")))
        assertTrue(ModoLigero.soloAbi32(listOf("x86")))
        assertFalse(ModoLigero.soloAbi32(listOf("arm64-v8a", "armeabi-v7a", "armeabi")))
        assertFalse(ModoLigero.soloAbi32(listOf("x86_64", "x86")))
        assertFalse("sin datos no se asume nada", ModoLigero.soloAbi32(emptyList()))
    }

    @Test fun `la version mayor del WebView se lee del versionName`() {
        assertEquals(103, ModoLigero.versionMayor("103.0.5060.71"))
        assertEquals(99, ModoLigero.versionMayor("99.0.4844.88"))
        assertEquals(52, ModoLigero.versionMayor(" 52.0.2743.100 "))
        assertEquals(120, ModoLigero.versionMayor("120"))
        assertNull(ModoLigero.versionMayor(null))
        assertNull(ModoLigero.versionMayor(""))
        assertNull(ModoLigero.versionMayor("desconocida"))
        assertNull(ModoLigero.versionMayor("v103.0"))
        assertNull(ModoLigero.versionMayor("12345678"))
    }
}
