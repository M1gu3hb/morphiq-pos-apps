package mx.morphiq.pos.app.logica

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ModoDelPuenteTest {
    @Test fun `un WebView moderno no tiene nada que avisar`() {
        val modo = ModoDelPuente(inicioDelDocumento = true, marcoPrincipalVerificado = true)
        assertFalse(modo.planB)
        assertFalse(modo.requiereAviso)
        assertTrue(modo.avisos().isEmpty())
        assertEquals("inicio-del-documento", modo.aJson().getString("inyeccion"))
        assertEquals("web-message-listener", modo.aJson().getString("canal"))
        assertEquals(modo, ModoDelPuente.COMPLETO)
    }

    @Test fun `sin guion al inicio del documento se usa el plan B y se avisa, sin bloquear`() {
        val modo = ModoDelPuente(inicioDelDocumento = false, marcoPrincipalVerificado = true)
        assertTrue(modo.planB)
        assertTrue(modo.requiereAviso)
        assertEquals(1, modo.avisos().size)
        assertTrue(modo.avisos()[0].contains("modo compatible"))
        assertEquals("plan-b", modo.aJson().getString("inyeccion"))
    }

    @Test fun `sin WEB_MESSAGE_LISTENER se avisa que solo se revisa la pagina principal`() {
        val modo = ModoDelPuente(inicioDelDocumento = true, marcoPrincipalVerificado = false)
        assertFalse(modo.planB)
        assertTrue(modo.requiereAviso)
        assertTrue(modo.avisos().single().contains("página principal"))
        assertEquals("javascript-interface", modo.aJson().getString("canal"))
        assertFalse(modo.aJson().getBoolean("marcoPrincipalVerificado"))
    }

    @Test fun `un fallo al registrar el guion cae al plan B y deja el motivo`() {
        val modo = ModoDelPuente(inicioDelDocumento = false, marcoPrincipalVerificado = true, falloAlInstalar = "IllegalArgumentException")
        assertTrue(modo.avisos().any { it.contains("IllegalArgumentException") })
    }

    @Test fun `el aviso unico no usa tecnicismos`() {
        val texto = ModoDelPuente(false, false).avisoUnico()
        assertFalse(texto.contains("WebView") || texto.contains("JavaScript"))
    }
}
